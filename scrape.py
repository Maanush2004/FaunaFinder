import httpx
import re
import json
from bs4 import BeautifulSoup, SoupStrainer
import cchardet

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
