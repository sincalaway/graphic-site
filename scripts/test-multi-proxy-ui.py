"""Offline browser test for the multi-provider proxy settings. Every /api/image call is mocked."""
import base64
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('GRAPHIC_TEST_URL', 'http://127.0.0.1:4206/')
CHROMIUM = os.environ.get('CHROMIUM_PATH')
PNG = base64.b64encode((ROOT / 'public/assets/style-0.png').read_bytes()).decode()
KEY = 'sk-offlineplaceholder123'

with sync_playwright() as p:
    launch = {'args': ['--no-sandbox']}
    if CHROMIUM:
        launch['executable_path'] = CHROMIUM
    browser = p.chromium.launch(**launch)
    context = browser.new_context(viewport={'width': 375, 'height': 850})
    page = context.new_page()
    calls, errors = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    context.route('https://**/*', lambda route: route.abort())

    def api(route):
        req = route.request
        calls.append({'url': req.url, 'headers': req.headers, 'body': req.post_data})
        if req.url.endswith('/api/image/sensenova/models'):
            route.fulfill(status=401, content_type='application/json',
                          body=json.dumps({'error': {'code': 'upstream_error', 'upstream_status': 401}}))
        elif req.url.endswith('/models'):
            route.fulfill(status=200, content_type='application/json',
                          body=json.dumps({'data': [{'id': 'Kwai-Kolors/Kolors'}, {'id': 'Qwen/Qwen3-8B'}]}))
        else:
            n = json.loads(req.post_data).get('n', 1)
            route.fulfill(status=200, content_type='application/json',
                          body=json.dumps({'data': [{'b64_json': PNG, 'mime': 'image/png'}] * n}))
    page.route('**/api/image/**', api)
    page.goto(BASE)
    page.locator('#api-help').click()
    expect(page.locator('#api-protocol')).to_have_value('multi-proxy')
    expect(page.locator('#api-provider')).to_be_visible()
    assert page.locator('#api-base-label').is_hidden()
    page.locator('#api-enabled').check()
    # A key pasted with a Bearer prefix, quotes and a trailing newline is accepted.
    page.locator('#api-key').fill(f'Bearer "{KEY}"')
    page.locator('#api-detect').click()
    expect(page.locator('#api-key-result')).to_contain_text('硅基流动', timeout=10000)
    expect(page.locator('#api-provider')).to_have_value('siliconflow')
    expect(page.locator('#api-model')).to_have_value('Kwai-Kolors/Kolors')
    assert all(c['headers']['authorization'] == 'Bearer ' + KEY for c in calls)
    page.locator('#api-model').fill('my-org/custom-image-model')  # free model choice
    page.locator('#api-consent').check()
    before = len(calls)
    page.locator('#api-settings-form button[type=submit]').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    assert len(calls) == before, 'saving must not send requests'
    status = page.evaluate('GraphicAPI.status()')
    assert status['protocol'] == 'multi-proxy' and status['provider'] == 'siliconflow'
    assert status['model'] == 'my-org/custom-image-model'
    assert KEY not in page.evaluate('JSON.stringify(localStorage)')
    out = page.evaluate('GraphicAPI.generate({tool:"logo", brand:"G", count:4}).then(r => r.items.length)')
    assert out == 4
    gen = [c for c in calls if c['url'].endswith('/generate')]
    assert len(gen) == 1 and json.loads(gen[0]['body'])['n'] == 4  # SiliconFlow allows 4 per call
    assert json.loads(gen[0]['body'])['model'] == 'my-org/custom-image-model'
    # Zhipu cannot edit: the edit operation is disabled rather than failing upstream.
    page.locator('#api-help').click()
    page.locator('#api-provider').select_option('zhipu')
    page.locator('#api-key').fill('0123456789abcdef0123456789abcdef.AbCdEfGhIjKl')
    page.locator('#api-consent').check()
    page.locator('#api-settings-form button[type=submit]').click()
    assert page.evaluate('GraphicAPI.status().operations.edit') is False
    # Remember on this device puts the configuration in localStorage; clear removes it.
    page.locator('#api-help').click()
    page.locator('#api-key').fill('0123456789abcdef0123456789abcdef.AbCdEfGhIjKl')
    page.locator('#api-remember').check()
    page.locator('#api-consent').check()
    page.locator('#api-settings-form button[type=submit]').click()
    assert 'graphic-api-settings-v1' in page.evaluate('Object.keys(localStorage)')
    page.locator('#api-help').click()
    page.locator('#api-clear').click()
    assert 'graphic-api-settings-v1' not in page.evaluate('Object.keys(localStorage)')
    assert page.evaluate('GraphicAPI.status().demo')
    assert not errors, errors
    browser.close()
print(json.dumps({'passed': True, 'mock_api_requests': len(calls)}))
