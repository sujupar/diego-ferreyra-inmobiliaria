import sys
import json
import requests
from bs4 import BeautifulSoup
import argparse
import re
import random
import time
import base64
from typing import Union, Optional, List, Dict, Any

# --- Configuration ---

USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
]

HEADERS = {
    'Authority': 'www.zonaprop.com.ar',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def get_random_user_agent():
    return random.choice(USER_AGENTS)

def clean_text(text: Optional[str]) -> Optional[str]:
    """
    Limpia una cadena de texto, decodifica escapes de Unicode,
    corrige problemas de codificación (mojibake) y elimina etiquetas HTML.
    """
    if not text:
        return ""
    try:
        if not isinstance(text, str):
             text = str(text)
             
        # Normalize whitespace first
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Try decoding if it looks like escaped unicode
        try:
            cleaned_text = bytes(text, "utf-8").decode("unicode_escape", 'ignore')
        except:
            cleaned_text = text

        # Fix encoding issues like latin1 vs utf8
        try:
            fixed_text = cleaned_text.encode('latin1').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            fixed_text = cleaned_text
            
        # Strip HTML tags just in case
        return BeautifulSoup(fixed_text, "html.parser").get_text(separator=' ', strip=True)
    except Exception:
        return text

def parse_number(text_str: Union[str, int]) -> Optional[int]:
    if text_str is None:
        return None
    text_str = str(text_str).replace('.', '')
    numeros = re.findall(r'\d+', text_str)
    return int(numeros[0]) if numeros else None

def parse_price(price_str):
    if not price_str:
        return None, None
    
    price_str = clean_text(price_str)
    
    # Detect currency
    currency = 'USD' if 'USD' in price_str or 'U$S' in price_str or 'US$' in price_str else 'ARS'
    if '$' in price_str and currency == 'ARS':
         pass

    # Extract number
    nums = re.findall(r'\d+', price_str)
    if not nums:
        return None, currency
        
    full_num_str = "".join(nums)
    try:
        val = float(full_num_str)
        return val, currency
    except:
        return None, currency

def extract_json_snippet(script_text: str, key_name: str) -> Optional[Union[Dict, List]]:
    try:
        pattern = f'["\']{key_name}["\']\s*:\s*([\[{{])'
        match = re.search(pattern, script_text)
        if not match: return None

        opening_bracket = match.group(1)
        closing_bracket = '}' if opening_bracket == '{' else ']'
        content_start_index = match.end(1) - 1
        
        bracket_count = 1
        for i, char in enumerate(script_text[content_start_index + 1:]):
            if char == opening_bracket: bracket_count += 1
            elif char == closing_bracket: bracket_count -= 1
            
            if bracket_count == 0:
                content_end_index = content_start_index + 1 + i
                json_str = script_text[content_start_index:content_end_index + 1]
                return json.loads(json_str)
        return None
    except (json.JSONDecodeError, IndexError, TypeError):
        return None

def extract_zonaprop(url, soup):
    # Logic provided by user for ZonaProp
    html_content = str(soup)
    script_tag = soup.find('script', string=re.compile(r'const\s+avisoInfo\s+='))
    search_area = script_tag.string if script_tag else html_content

    data = {
        'url': url,
        'portal': 'Zonaprop',
        'title': '',
        'price': None,
        'currency': None,
        'location': '',
        'description': '',
        'images': [],
        'features': {}
    }

    # --- PRIMARY EXTRACTION FROM JS OBJECT ---

    posting_title_match = re.search(r"'postingTitle'\s*:\s*\"(.*?)\"", search_area, re.DOTALL)
    if posting_title_match:
        data['title'] = clean_text(posting_title_match.group(1))

    prices_data = extract_json_snippet(search_area, 'pricesData')
    if prices_data and isinstance(prices_data, list) and prices_data:
        price_info = prices_data[0].get('prices', [{}])[0]
        data['price'] = price_info.get('amount')
        data['currency'] = price_info.get('isoCode')

    features = {}
    main_features = extract_json_snippet(search_area, 'mainFeatures')
    if main_features:
        for feature in main_features.values():
            label = feature.get('label', '').lower()
            value = feature.get('value')
            if 'tot.' in label or 'total' in label: features['totalArea'] = parse_number(value)
            elif 'cub.' in label or 'cubierta' in label: features['coveredArea'] = parse_number(value)
            elif 'amb.' in label or 'ambiente' in label: features['rooms'] = parse_number(value)
            elif 'dorm.' in label or 'dormitorio' in label: features['bedrooms'] = parse_number(value)
            elif 'baño' in label: features['bathrooms'] = parse_number(value)
            elif 'coch.' in label or 'cochera' in label: features['garages'] = parse_number(value)
            elif 'antigüedad' in label: features['age'] = parse_number(value) # Trying to parse number from age string
    data['features'] = features

    # Image
    pictures = extract_json_snippet(search_area, 'pictures')
    if pictures and isinstance(pictures, list) and pictures:
        # Get all images
        for pic in pictures:
            img_url = pic.get('resizeUrl1200x1200') or pic.get('url')
            if img_url:
                data['images'].append(img_url)

    # --- FALLBACKS ---
    
    # 1. Location
    location_info = extract_json_snippet(search_area, 'location')
    address_info = extract_json_snippet(search_area, 'address')
    if address_info and location_info:
        parts = [
            clean_text(address_info.get('name', '')), 
            clean_text(location_info.get('name', '')), 
            clean_text(location_info.get('parent', {}).get('name', ''))
        ]
        data['location'] = ", ".join(filter(None, parts))
    
    if not data['location']:
        loc_tag = soup.find('div', class_='section-location') or soup.find('h2', class_='title-location')
        if loc_tag:
            data['location'] = clean_text(loc_tag.text)

    # Description
    description_match = re.search(r"'description'\s*:\s*\"(.*?)\"", search_area, re.DOTALL)
    if description_match:
        data['description'] = clean_text(description_match.group(1))
    if not data['description']:
        desc_div = soup.find('div', id='section-description-mobile') or soup.find('div', class_='section-description')
        if desc_div:
            data['description'] = clean_text(desc_div.get_text(separator='\n'))

    # Missing Title fallback
    if not data['title']:
         title_tag = soup.find('h1', class_='title-type-sup') or soup.find('h1')
         data['title'] = clean_text(title_tag.text) if title_tag else ""
         
    return data

def extract_argenprop(url, soup):
    """ArgenProp extraction using user's N8N logic"""
    html_content = str(soup)
    
    data = {
        'url': url,
        'portal': 'Argenprop',
        'title': '',
        'price': None,
        'currency': None,
        'location': '',
        'description': '',
        'images': [],
        'features': {}
    }

    try:
        # --- 1. JSON-LD Structured Data ---
        json_ld_script = soup.find('script', {'type': 'application/ld+json'})
        if json_ld_script:
            try:
                json_data = json.loads(json_ld_script.string)
                data['title'] = clean_text(json_data.get('name'))
                
                # Main image
                if json_data.get('image'):
                    data['images'].append(json_data['image'])
                
                # Rooms and bedrooms
                if json_data.get('numberOfRooms'):
                    data['features']['rooms'] = json_data['numberOfRooms']
                if json_data.get('numberOfBedrooms'):
                    data['features']['bedrooms'] = json_data['numberOfBedrooms']
                
                # Address
                address_data = json_data.get('address', {})
                location_parts = [
                    address_data.get('streetAddress'),
                    address_data.get('addressRegion'),
                    address_data.get('addressLocality')
                ]
                data['location'] = ", ".join(filter(None, location_parts))
            except:
                pass

        # --- 2. Description (Complete from visible div) ---
        description_tag = soup.select_one('.section-description--content')
        if description_tag:
            data['description'] = clean_text(description_tag.get_text(separator='\n'))
        
        # --- 3. Price and Currency ---
        price_tag = soup.find('p', class_='titlebar__price')
        if price_tag:
            price_text = ' '.join(price_tag.get_text().strip().split())
            if price_text:
                parts = price_text.split()
                if len(parts) > 1:
                    data['currency'] = parts[0]
                    data['price'] = parse_number(parts[1])

        # --- 4. Expenses ---
        expenses_tag = soup.find('p', class_='titlebar__expenses')
        if not expenses_tag:
            price_mobile = soup.find('div', class_='titlebar__price-mobile')
            if price_mobile:
                expenses_tag = price_mobile.find('span')
        
        if expenses_tag:
            data['features']['expenses'] = parse_number(expenses_tag.get_text())

        # --- 5. Property Type ---
        prop_type_tag = soup.select_one('.property-main-features li:first-child .strong')
        if prop_type_tag:
            data['features']['propertyType'] = ' '.join(prop_type_tag.get_text().strip().split())

        # --- 6. Coordinates ---
        map_tag = soup.find('div', {'data-latitude': True, 'data-longitude': True})
        if map_tag:
            data['features']['latitude'] = float(map_tag['data-latitude'].replace(',', '.'))
            data['features']['longitude'] = float(map_tag['data-longitude'].replace(',', '.'))

        # --- 7. Agent Name ---
        agent_name_tag = soup.find('p', class_='form-details-heading')
        if agent_name_tag:
            data['features']['agentName'] = ' '.join(agent_name_tag.get_text().strip().split())

        # --- 8. WhatsApp Phone ---
        whatsapp_link = soup.select_one('a[href*="wa.me/"]')
        if whatsapp_link:
            phone_match = re.search(r'wa\.me/(\d+)', whatsapp_link['href'])
            if phone_match:
                data['features']['phone'] = phone_match.group(1)

        # --- 9. Extract surfaces from description if available ---
        if data['description']:
            total_match = re.search(r'Superficie Total:\s*(\d+)', data['description'], re.IGNORECASE)
            cubierta_match = re.search(r'Superficie Cubierta:\s*(\d+)', data['description'], re.IGNORECASE)
            if total_match:
                data['features']['totalArea'] = int(total_match.group(1))
            if cubierta_match:
                data['features']['coveredArea'] = int(cubierta_match.group(1))

        # --- 10. Main Features List ---
        features_list = soup.select('.property-main-features li .strong')
        for feature in features_list:
            text = ' '.join(feature.get_text().strip().split()).lower()
            if 'cubierta' in text and not data['features'].get('coveredArea'):
                data['features']['coveredArea'] = parse_number(text)
            elif 'baño' in text:
                data['features']['bathrooms'] = parse_number(text)
            elif 'ambientes' in text and not data['features'].get('rooms'):
                data['features']['rooms'] = parse_number(text)
            elif 'dormitorio' in text and not data['features'].get('bedrooms'):
                data['features']['bedrooms'] = parse_number(text)
            elif 'cochera' in text:
                data['features']['garages'] = parse_number(text)
            elif 'años' in text:
                data['features']['age'] = parse_number(text)
            elif 'frente' in text or 'contrafrente' in text:
                data['features']['disposition'] = ' '.join(feature.get_text().strip().split())

        # --- 11. Total Surface Fallback ---
        if not data['features'].get('totalArea'):
            total_surface_tag = soup.find(lambda tag: tag.name == 'p' and 'Sup. Total' in tag.text)
            if total_surface_tag and total_surface_tag.find('strong'):
                data['features']['totalArea'] = parse_number(total_surface_tag.find('strong').get_text())

        # Fallback title
        if not data['title']:
            data['title'] = clean_text(soup.select_one('h1').text) if soup.select_one('h1') else ""

    except Exception as e:
        data['features']['parsing_error'] = str(e)

    return data

def extract_mercadolibre(url, soup):
    """MercadoLibre extraction using user's N8N logic"""
    html_content = str(soup)
    
    data = {
        'url': url,
        'portal': 'MercadoLibre',
        'title': '',
        'price': None,
        'currency': None,
        'location': '',
        'description': '',
        'images': [],
        'features': {}
    }

    try:
        # --- 1. Title ---
        title_tag = soup.select_one('h1.ui-pdp-title')
        data['title'] = clean_text(title_tag.text) if title_tag else ""

        # --- 2. Price and Currency ---
        price_container = soup.select_one('.ui-pdp-price__main-container')
        if price_container:
            currency_tag = price_container.select_one('.andes-money-amount__currency-symbol')
            price_tag = price_container.select_one('.andes-money-amount__fraction')
            
            data['currency'] = clean_text(currency_tag.text) if currency_tag else "$"
            data['price'] = parse_number(price_tag.text) if price_tag else None

        # --- 3. Coordinates from Map Image ---
        map_image = soup.select_one('img[src*="maps.googleapis.com/maps/api/staticmap"]')
        if map_image:
            coords_match = re.search(r'center=(-?[\d\.]+)[,%2C]+(-?[\d\.]+)', map_image['src'])
            if coords_match:
                data['features']['latitude'] = float(coords_match.group(1))
                data['features']['longitude'] = float(coords_match.group(2))

        # --- 4. Location ---
        location_tag = soup.select_one('.ui-vip-location__subtitle')
        if location_tag:
            data['location'] = clean_text(location_tag.text)
        elif soup.select_one('.ui-pdp-media__title'):
            data['location'] = clean_text(soup.select_one('.ui-pdp-media__title').text)

        # --- 5. Seller Name ---
        seller_name_tag = soup.select_one('a.ui-vip-profile-info__info-link') or soup.select_one('.ui-pdp-seller__link-trigger')
        if seller_name_tag:
            data['features']['sellerName'] = clean_text(seller_name_tag.text)

        # --- 6. Description ---
        desc_tag = soup.select_one('.ui-pdp-description__content')
        data['description'] = clean_text(desc_tag.text) if desc_tag else ""

        # --- 7. Main Image ---
        image_tag = soup.select_one('.ui-pdp-gallery__figure__image')
        if image_tag and image_tag.has_attr('data-zoom'):
            data['images'].append(image_tag['data-zoom'])
        else:
            # Try JSON-LD
            json_ld_script = soup.find('script', type='application/ld+json')
            if json_ld_script:
                try:
                    json_data = json.loads(json_ld_script.string)
                    if 'image' in json_data:
                        image_data = json_data.get('image')
                        img_url = image_data[0] if isinstance(image_data, list) else image_data
                        if img_url:
                            data['images'].append(img_url)
                except:
                    pass
        
        # Fallback: og:image
        if not data['images']:
            og_image_tag = soup.select_one('meta[property="og:image"]')
            if og_image_tag and og_image_tag.has_attr('content'):
                data['images'].append(og_image_tag['content'])

        # --- 8. Main Features from Specs Table ---
        key_map = {
            'Superficie total': 'totalArea',
            'Superficie cubierta': 'coveredArea',
            'Dormitorios': 'bedrooms',
            'Baños': 'bathrooms',
            'Cocheras': 'garages',
            'Ambientes': 'rooms',
            'Antigüedad': 'age'
        }
        
        specs_table = soup.select_one('table.andes-table')
        if specs_table:
            for row in specs_table.find_all('tr'):
                key_tag = row.find('th')
                value_tag = row.find('td')
                if key_tag and value_tag:
                    key = clean_text(key_tag.text)
                    if key in key_map:
                        dict_key = key_map[key]
                        value_text = clean_text(value_tag.text)
                        # Keep age as string, parse others as numbers
                        data['features'][dict_key] = value_text if dict_key == 'age' else parse_number(value_text)

        # --- 9. Days on Market ---
        antiquity_tag = soup.select_one('p.ui-pdp-header__bottom-subtitle')
        if antiquity_tag:
            antiquity_text = clean_text(antiquity_tag.text)
            if antiquity_text and "Publicado hace" in antiquity_text:
                match = re.search(r'Publicado hace (.*)', antiquity_text)
                if match:
                    data['features']['daysOnMarket'] = match.group(1).strip()
        
        # Fallback for days on market
        if not data['features'].get('daysOnMarket'):
            antiquity_tag = soup.select_one('p.ui-pdp-seller-validated__title')
            if antiquity_tag:
                antiquity_text = clean_text(antiquity_tag.text)
                if antiquity_text and "Publicado hace" in antiquity_text:
                    match = re.search(r'Publicado hace (.*?)( por |$)', antiquity_text)
                    if match:
                        data['features']['daysOnMarket'] = match.group(1).strip()

    except Exception as e:
        data['features']['parsing_error'] = str(e)

    return data

def main():
    parser = argparse.ArgumentParser(description='Scrape real estate property')
    parser.add_argument('url', help='URL of the property')
    args = parser.parse_args()
    
    url = args.url
    
    # ScraperAPI Configuration
    API_KEY = '3cd985c09cab09eb7aaf657a2d120abe'
    proxies = {
        "http": f"http://scraperapi:{API_KEY}@proxy-server.scraperapi.com:8001",
        "https": f"http://scraperapi:{API_KEY}@proxy-server.scraperapi.com:8001"
    }
    
    headers = HEADERS.copy()
    headers['User-Agent'] = get_random_user_agent()
    
    try:
        # Use verify=False to avoid SSL issues with the proxy
        response = requests.get(url, headers=headers, proxies=proxies, verify=False, timeout=60)
        # response = requests.get(url, headers=headers, timeout=60) # Fallback for local testing if needed
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        if 'zonaprop' in url:
            result = extract_zonaprop(url, soup)
        elif 'argenprop' in url:
            result = extract_argenprop(url, soup)
        elif 'mercadolibre' in url:
            result = extract_mercadolibre(url, soup)
        else:
             print(json.dumps({'error': 'Unsupported portal'}))
             sys.exit(1)
             
        print(json.dumps({'success': True, 'data': result}))
        
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    # Suppress SSL warnings
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    main()
