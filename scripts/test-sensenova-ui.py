"""Offline browser coverage; all API calls intercepted, no provider requests."""
import base64
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('GRAPHIC_TEST_URL', 'http://127.0.0.1:4206/')
PNG = base64.b64encode((ROOT / 'public/assets/style-0.png').read_bytes()).decode()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 375, 'height': 850})
    page = context.new_page()
    calls, errors = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def mock(route):
        req = route.request
        calls.append({'url': req.url, 'headers': req.headers, 'body': req.post_data_buffer})
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'data': [{'b64_json': PNG}]}))
    # External network must never be used by the dedicated mode.
    context.route('https://**/*', lambda route: route.abort())
    page.route('**/api/sensenova/**', mock)
    page.goto(BASE)
    assert page.evaluate('GraphicAPI.status().demo')
    page.locator('#api-help').click()
    page.locator('#api-enabled').check()
    page.locator('#api-protocol').select_option('sensenova-proxy')
    assert page.locator('#api-base-url').input_value() == BASE.rstrip('/') + '/api/sensenova'
    assert page.locator('#api-base-url').evaluate('(e) => e.readOnly')
    assert page.locator('#api-model').evaluate('(e) => e.readOnly')
    expect(page.locator('#api-model')).to_have_value('sensenova-u1.5-lite')
    expect(page.locator('#api-request-preview')).to_contain_text('/api/sensenova/images/generations')
    page.locator('#api-key').fill('offline-placeholder-key')
    page.locator('#api-consent').check()
    page.locator('#api-settings-form button[type=submit]').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    assert not calls
    assert 'offline-placeholder-key' not in page.evaluate('JSON.stringify(localStorage)')
    assert 'offline-placeholder-key' not in page.evaluate('JSON.stringify(GraphicAPI.status())')
    assert page.locator('#api-key').input_value() == ''
    page.reload()
    assert page.evaluate('GraphicAPI.status().protocol') == 'sensenova-proxy'
    # Storage tampering cannot change the dedicated upstream, path or model.
    page.evaluate('''() => {
      const c = GraphicAPISettings.get();
      c.baseUrl = 'https://attacker.invalid'; c.model = 'other';
      c.generatePath = '/arbitrary'; c.vectorizePath = '/vectorize';
      sessionStorage.setItem('graphic-api-settings-v1', JSON.stringify(c));
    }''')
    assert page.evaluate('GraphicAPISettings.get().model') == 'sensenova-u1.5-lite'
    page.evaluate('GraphicAPI.generate({tool:"logo", count:1})')
    assert len(calls) == 1
    assert calls[-1]['url'] == BASE.rstrip('/') + '/api/sensenova/images/generations'
    assert calls[-1]['headers']['authorization'] == 'Bearer offline-placeholder-key'
    assert json.loads(calls[-1]['body'])['model'] == 'sensenova-u1.5-lite'
    page.evaluate('(png) => GraphicAPI.edit({tool:"logo", sourceImage:"data:image/png;base64,"+png})', PNG)
    assert len(calls) == 2
    assert calls[-1]['url'].endswith('/api/sensenova/images/edits')
    assert 'multipart/form-data; boundary=' in calls[-1]['headers']['content-type']
    assert b'name="image[]"' in calls[-1]['body']
    assert b'name="n"' in calls[-1]['body']
    assert page.evaluate('GraphicAPI.vectorize({tool:"vectorize"}).then(()=>false,e=>e.code)') == 'API_VECTORIZE_UNSUPPORTED'
    assert page.evaluate('GraphicAPI.generate({tool:"logo",count:5}).then(()=>false,e=>e.code)') == 'INVALID_REQUEST'
    assert len(calls) == 2
    assert page.evaluate('GraphicAPI.edit({tool:"logo",sourceImage:"data:image/gif;base64,AAAA"}).then(()=>false,e=>e.code)') == 'INVALID_REQUEST'
    assert page.evaluate('GraphicAPI.edit({tool:"logo",sourceImage:"data:image/png;base64,"+btoa("x".repeat(8*1024*1024+1))}).then(()=>false,e=>e.code)') == 'INVALID_REQUEST'
    assert len(calls) == 2
    def failed(route):
        calls.append({'url': route.request.url})
        route.fulfill(status=401, content_type='application/json', body='{"error":{"message":"offline-placeholder-key"}}')
    page.route('**/api/sensenova/**', failed)
    result = page.evaluate('GraphicAPI.generate({tool:"logo"}).then(()=>false,e=>GraphicAPI.errorInfo(e))')
    assert result['status'] == 401
    assert 'offline-placeholder-key' not in json.dumps(result)
    page.wait_for_timeout(350)
    assert len(calls) == 3, 'failed request must not retry'
    page.locator('#api-help').click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    page.locator('#api-clear').click()
    assert page.evaluate('GraphicAPI.status().demo')
    assert 'offline-placeholder-key' not in page.evaluate('JSON.stringify(sessionStorage)')
    assert not errors, errors
    browser.close()
    print('SenseNova UI offline tests passed: fixed routing/model, consent, session, JSON, multipart, no retry/leaks, clear')
