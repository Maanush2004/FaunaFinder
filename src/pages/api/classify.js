import * as tf from "@tensorflow/tfjs-node";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const formidable = require("formidable");

export const config = {
  api: {
    bodyParser: false, // Disable automatic body parsing for file uploads
  },
};

let model;
let classLabels = [];

// Function to load model
async function loadModel() {
  if (!model) {
    const modelPath = `file://${path.join(process.cwd(), "public/model/model.json")}`;
    model = await tf.loadLayersModel(modelPath);
    console.log("Model loaded");
  }
}

// Function to load labels
function loadLabels() {
  if (classLabels.length === 0) {
    const labelsPath = path.join(process.cwd(), "public/model/labels.txt");
    const labelsData = fs.readFileSync(labelsPath, "utf8");
    classLabels = labelsData.split("\n").map((label) => label.trim()).filter(Boolean);
    console.log("Labels loaded:", classLabels);
  }
}

async function wiki(Animal_args) {
    const Animal = Animal_args.split(';');
    let summary_url = null;
    let taxonomy_url = null;
    const resp = {};

    const disambiguation = Animal[0].indexOf('(');
    if (disambiguation === -1) {
        resp['label'] = Animal[0];
    } else {
        resp['label'] = Animal[0].substring(0, disambiguation - 1);
    }

    if (Animal.length === 1) {
        summary_url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + Animal[0];
        taxonomy_url = "https://en.wikipedia.org/wiki/" + Animal[0];
    } else if (Animal.length === 2) {
        summary_url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + Animal[0];
        taxonomy_url = "https://en.wikipedia.org/wiki/" + Animal[1];
    } else if (Animal.length === 3) {
        summary_url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + Animal[1];
        taxonomy_url = "https://en.wikipedia.org/wiki/" + Animal[2];
    }

    let content, r;
    try {
        // Fetch summary data
        const summaryResponse = await fetch(summary_url);
        content = await summaryResponse.json();

        // Fetch taxonomy page HTML
        const taxonomyResponse = await fetch(taxonomy_url);
        r = await taxonomyResponse.text();
    } catch (error) {
        console.error('Error fetching data:', error);
        return resp;
    }

    if (content && content.extract) {
        resp['summary'] = content.extract;
    }
    if (content && content.originalimage) {
        resp['imgurl'] = content.originalimage.source;
    }

    const $ = cheerio.load(r);
    const infoboxTables = $('table.infobox');

    let found_taxonomy = false;
    const taxonomy = {};

    infoboxTables.find('tr').each((i, row) => {
        const th = $(row).find('th');
        if (th.length > 0) {
            if (!found_taxonomy && th.text().includes("Scientific classification")) {
                found_taxonomy = true;
            } else if (found_taxonomy) {
                return false; // Break the loop
            }
        } else if (found_taxonomy) {
            const tr = $(row).find('td');
            if (tr.length > 1) {
                if (tr.eq(0).text().includes("Subspecies:")) {
                    return false; // Break the loop
                }
                const key = tr.eq(0).text().trim().slice(0, -1); // Remove trailing colon
                const val = tr.eq(1).find('i').text().trim() || tr.eq(1).find('a').text().trim() || tr.eq(1).text().trim();
                taxonomy[key] = val.split('[')[0]; // Remove any brackets
            }
        }
    });

    resp['taxonomy'] = taxonomy;
    return resp;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await loadModel(); // Load model if not already loaded
  loadLabels(); // Load class labels

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: "File upload error" });
    }

    try {
      const filePath = files.image[0].filepath; // Get uploaded file path
      const imageBuffer = fs.readFileSync(filePath);
      const decodedImage = tf.node.decodeImage(imageBuffer, 3);
      const resizedImage = tf.image.resizeBilinear(decodedImage, [299, 299]); // Resize
      const inputTensor = resizedImage.expandDims(0).toFloat().div(255); // Normalize

      const predictions = model.predict(inputTensor);
      const predictedIndex = predictions.argMax(1).dataSync()[0];
      const predictedClass = classLabels[predictedIndex] || "Unknown";
      
      // Dispose tensors to free up memory
      decodedImage.dispose();
      resizedImage.dispose();
      inputTensor.dispose();
      predictions.dispose();
      res.json(await wiki(predictedClass));
    } catch (error) {
      console.error("Error processing image:", error);
      res.status(500).json({ error: "Error processing image" });
    }
  });
}
