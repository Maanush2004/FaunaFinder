import httpx
import re
import json
from bs4 import BeautifulSoup, SoupStrainer
import cchardet
import tensorflow as tf
from PIL import Image
from flask import Flask, jsonify, request
import numpy as np
import io

app = Flask(__name__)

def wiki(Animal) :
    Animal = Animal.strip()
    summary_url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + Animal
    taxonomy_url = "https://en.wikipedia.org/wiki/" + Animal
    r = None
    content = None
    with httpx.Client(follow_redirects=True) as client:
        content = client.get(summary_url).json()
        r = client.get(taxonomy_url)
    resp = {}
    if 'extract' in content :
        resp['summary'] = content['extract']
    if 'originalimage' in content : 
        resp['imgurl'] = content['originalimage']['source']
    infobox_tables = SoupStrainer('table', class_= lambda x: x and 'infobox' in x) 
    soup = BeautifulSoup(r.text, 'lxml', parse_only=infobox_tables)
    try :
        table = soup.find('tbody').find_all('tr')
    except :
        return resp
    found_taxonomy = False
    taxonomy = {}
    index=0
    for row in table:
        th = row.find('th')
        if th != -1 and th is not None :
            if not found_taxonomy and "Scientific classification" in th.text:
                found_taxonomy = True
            elif found_taxonomy:
                break
        elif found_taxonomy :
            tr = row.find_all('td')
            if "Subspecies:" in tr[0].text :
                break
            if tr[1].find('i') is not None :
                val = tr[1].find('i').text.strip()
                taxonomy[index] = {tr[0].text.strip()[:-1] : val[:val.find('[')] if '[' in val else val}
                index += 1
            elif tr[1].find('a') is not None :
                taxonomy[index] = {tr[0].text.strip()[:-1] : tr[1].find('a').text.strip()}
                index += 1
            else :
                taxonomy[index] = {tr[0].text.strip()[:-1] : tr[1].text}
                index += 1
    resp['taxonomy']=taxonomy
    return resp

class_labels = []
with open('labels.txt','r') as labels:
    class_labels = list(map(lambda x: x.strip(), labels.readlines()))
model = tf.keras.models.load_model('model.keras')

@app.route('/api/classify', methods=['POST'])
def classify():
    # Get the uploaded file from the form
    file = request.files['image']
        
    # Convert it to a BytesIO object
    image_bytes = io.BytesIO(file.read())
        
    # Open the image using PIL
    image = Image.open(image_bytes)
    
    # Resize the image to the expected input size of the model
    image = image.resize((299,299))
    img_array = np.array(image)  # Convert the image to array
    img_array = np.expand_dims(img_array, axis=0)  # Add batch dimension
    img_array = tf.keras.applications.xception.preprocess_input(img_array)

    predictions = model.predict(img_array)
    # Replace with actual class labels
    predicted_class = class_labels[np.argmax(predictions)]
    
    resp = wiki(predicted_class)
    
    resp['label'] = predicted_class
    print(resp)
    # return json
    return jsonify(resp)

if __name__ == '__main__':
    app.run(host='0.0.0.0') 
