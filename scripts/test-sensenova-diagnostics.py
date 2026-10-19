"""Offline browser diagnostics: placeholder credential, all API requests mocked."""
import json
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('GRAPHIC_TEST_URL', 'http://127.0.0.1:4210/')
KEY = 'offline-diagnostic-placeholder'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.route('https://**/*', lambda route: route.abort())
    page = context.new_page()
    calls, errors = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    scenario = {'status': 200, 'body': {'data': [{'id': 'sensenova-u1.5-lite', 'extra': KEY}]}}
    def mock(route):
        req = route.request
        calls.append({'url': req.url, 'method': req.method, 'headers': req.headers, 'body': req.post_data})
        route.fulfill(status=scenario['status'], content_type='text/html' if scenario.get('edge') else 'application/json', body='<html>challenge</html>' if scenario.get('edge') else json.dumps(scenario['body']))
    page.route('**/api/sensenova/**', mock)
    page.goto(BASE)
    page.locator('#api-help').click()
    page.locator('#api-protocol').select_option('sensenova-proxy')
    expect(page.locator('#api-check-models')).to_be_visible()
    page.locator('#api-check-models').click()
    expect(page.locator('#api-models-result')).to_contain_text('API 配置无效')
    assert calls == [], 'blank key must not send a request'
    page.locator('#api-key').fill(KEY)
    page.locator('#api-check-models').click()
    expect(page.locator('#api-models-result')).to_contain_text('可访问模型列表')
    expect(page.locator('#api-models-result')).to_contain_text('包含 sensenova-u1.5-lite')
    assert len(calls) == 1
    assert calls[0]['url'] == BASE.rstrip('/') + '/api/sensenova/models'
    assert calls[0]['method'] == 'GET' and calls[0]['body'] is None
    assert calls[0]['headers']['authorization'] == 'Bearer ' + KEY
    assert KEY not in page.evaluate('JSON.stringify(sessionStorage)+JSON.stringify(localStorage)')
    assert KEY not in page.locator('#api-models-result').inner_text()
    assert page.evaluate('GraphicAPI.status().demo'), 'read-only action must not save or enable API'
    scenario['body'] = {'data': [{'id': 'other-model'}]}
    page.locator('#api-check-models').click()
    expect(page.locator('#api-models-result')).to_contain_text('未包含 sensenova-u1.5-lite')
    for code, expected in [('origin_not_allowed', '本站同源检查拒绝'), ('upstream_error', 'SenseNova 上游拒绝'), ('unknown-secret-' + KEY, '认证或权限失败')]:
        scenario.update(status=403, body={'error': {'code': code, 'message': KEY}})
        page.locator('#api-check-models').click()
        expect(page.locator('#api-models-result')).to_contain_text(expected)
        assert KEY not in page.locator('#api-models-result').inner_text()
    scenario.update(status=403, body={'error': {'message': KEY}}, edge=True)
    page.locator('#api-check-models').click()
    expect(page.locator('#api-models-result')).to_contain_text('本站前置安全验证')
    assert KEY not in page.locator('#api-models-result').inner_text()
    scenario['edge'] = False
    assert all(call['method'] == 'GET' and call['url'].endswith('/models') for call in calls)
    page.locator('#api-enabled').check()
    page.locator('#api-consent').check()
    page.locator('#api-settings-form button[type=submit]').click()
    for code, mapped in [('origin_not_allowed', 'SENSENOVA_ORIGIN_NOT_ALLOWED'), ('upstream_error', 'SENSENOVA_UPSTREAM_FORBIDDEN'), ('unknown', 'HTTP_ERROR')]:
        scenario.update(status=403, body={'error': {'code': code, 'message': KEY}})
        # Image request is mocked locally; it can never reach any provider.
        result = page.evaluate('GraphicAPI.generate({tool:"logo",count:1}).then(()=>null,e=>GraphicAPI.errorInfo(e))')
        assert result['code'] == mapped and result['status'] == 403
        assert KEY not in json.dumps(result)
    assert len(calls) == 9, 'no implicit retries or save-time requests'
    assert not errors, errors
    browser.close()
print('SenseNova diagnostics offline UI passed: explicit GET, current form key, no persistence, model present/absent, static 403 mapping, no leaks/retries')
