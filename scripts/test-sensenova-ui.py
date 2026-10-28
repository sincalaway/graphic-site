"""Offline browser test: a saved legacy SenseNova proxy config migrates to the multi-provider proxy.
Every /api call is mocked; nothing reaches a provider."""
import base64
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('GRAPHIC_TEST_URL', 'http://127.0.0.1:4206/')
CHROMIUM = os.environ.get('CHROMIUM_PATH')
PNG = base64.b64encode((ROOT / 'public/assets/style-0.png').read_bytes()).decode()
KEY = 'offline-placeholder-key'

with sync_playwright() as p:
    launch = {'args': ['--no-sandbox']}
    if CHROMIUM:
        launch['executable_path'] = CHROMIUM
    browser = p.chromium.launch(**launch)
    context = browser.new_context(viewport={'width': 375, 'height': 850})
    context.route('https://**/*', lambda route: route.abort())
    page = context.new_page()
    calls, errors = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def mock(route):
        req = route.request
        calls.append({'url': req.url, 'headers': req.headers, 'body': req.post_data})
        route.fulfill(status=200, content_type='application/json',
                      body=json.dumps({'data': [{'b64_json': PNG, 'mime': 'image/png'}]}))
    page.route('**/api/**', mock)
    page.goto(BASE)
    # A configuration saved by the previous version of the site.
    page.evaluate('''(key) => sessionStorage.setItem('graphic-api-settings-v1', JSON.stringify({
      enabled: true, protocol: 'sensenova-proxy', baseUrl: location.origin + '/api/sensenova',
      model: 'sensenova-u1.5-lite', apiKey: key, consent: true }))''', KEY)
    page.reload()
    status = page.evaluate('GraphicAPI.status()')
    assert status['protocol'] == 'multi-proxy' and status['provider'] == 'sensenova', status
    assert status['model'] == 'sensenova-u1.5-lite'
    assert KEY not in json.dumps(status)
    page.evaluate('GraphicAPI.generate({tool:"logo", count:1})')
    assert len(calls) == 1
    assert calls[0]['url'] == BASE.rstrip('/') + '/api/image/sensenova/generate'
    assert calls[0]['headers']['authorization'] == 'Bearer ' + KEY
    body = json.loads(calls[0]['body'])
    assert body['model'] == 'sensenova-u1.5-lite' and not body.get('images')
    page.evaluate('(png) => GraphicAPI.edit({tool:"logo", sourceImage:"data:image/png;base64,"+png})', PNG)
    assert len(calls) == 2 and calls[1]['url'].endswith('/api/image/sensenova/generate')
    assert 'application/json' in calls[1]['headers']['content-type']
    assert 'data:image/png;base64,' in calls[1]['body']
    assert len(calls) == 2
    assert not errors, errors
    browser.close()
print('Legacy SenseNova config migration UI test passed: multi-proxy routing, JSON edits, no leaks')
