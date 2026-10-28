"""UI error regression tests against a local static server and mock provider only."""
import base64, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('GRAPHIC_TEST_URL', 'http://127.0.0.1:4206/')
ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64encode((ROOT / 'public/assets/style-0.png').read_bytes()).decode()


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 375, 'height': 850})
        page = context.new_page()
        calls, mode = [], {'value': '200'}
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        def mock(route):
            req = route.request
            if req.method == 'OPTIONS':
                route.fulfill(status=204, headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS'}); return
            calls.append(req.url)
            current = mode['value']
            if current == 'network':
                route.abort('failed'); return
            if current.isdigit() and int(current) != 200:
                route.fulfill(status=int(current), content_type='application/json', body=json.dumps({'error': {'message':'do not echo secret-placeholder'}}), headers={'Access-Control-Allow-Origin':'*'}); return
            body = {'data': []} if current == 'bad' else {'data':[{'b64_json':PNG}]}
            route.fulfill(status=200, content_type='application/json', body=json.dumps(body), headers={'Access-Control-Allow-Origin':'*'})

        page.route('https://mock-api.example/**', mock)
        page.goto(BASE)
        page.locator('#api-help').click()
        page.locator('#api-enabled').check()
        page.locator('#api-protocol').select_option('openai-images')
        page.locator('#api-base-url').fill('https://mock-api.example/v1')
        page.locator('#api-model').fill('mock-model')
        page.locator('#api-key').fill('secret-placeholder')
        # Saving settings is local-only and must expose the final request path without requesting it.
        page.locator('#api-consent').check()
        before = len(calls)
        page.locator('#api-settings-form button[type=submit]').click()
        assert len(calls) == before
        expect(page.locator('#api-request-preview')).to_contain_text('/v1/images/generations')
        assert page.evaluate('GraphicAPI.status().demo') is False
        assert page.locator('#api-key').input_value() == ''

        page.locator('#brand').fill('错误测试')
        page.locator('#concept').fill('稳定文案')
        page.locator('#generate').click()
        expect(page.locator('#result-grid .result-card')).to_have_count(1)
        original_count = page.locator('#result-grid .result-card').count()

        # Editing uses the same safe classification and never silently saves a version.
        page.locator('#result-grid [data-open]').first.click()
        page.locator('#edit-prompt').fill('更简洁')
        mode['value'] = '401'
        edit_attempts = len(calls)
        page.locator('#apply-edit').click()
        expect(page.locator('#api-error-settings')).to_be_visible()
        expect(page.locator('#dialog-content')).to_contain_text('HTTP_ERROR')
        expect(page.locator('#dialog-content')).to_contain_text('401')
        assert len(calls) == edit_attempts + 1
        assert page.locator('#result-grid .result-card').count() == original_count
        assert 'secret-placeholder' not in page.locator('#dialog-content').inner_text()
        page.locator('.dialog-close').click()

        # Each failure stays in an error dialog, has no provider/body leak, and never falls back to demo output.
        for failure in ['network', '401', '404', '429', '500', 'bad']:
            mode['value'] = failure
            attempts = len(calls)
            page.locator('#generate').click()
            expect(page.locator('#retry-job')).to_be_visible()
            text = page.locator('#dialog-content').inner_text()
            assert 'secret-placeholder' not in text
            assert page.locator('#result-grid .result-card').count() == original_count
            assert len(calls) == attempts + 1
            expect(page.locator('#dialog-content')).to_contain_text(
                'NETWORK_ERROR' if failure == 'network' else 'INVALID_RESPONSE' if failure == 'bad' else 'HTTP_ERROR')
            if failure != 'bad':
                assert failure == 'network' or failure in text
            # Retry is explicitly marked as potentially billable; it may be absent for non-repeatable errors.
            retry = page.locator('#retry-job')
            if retry.count():
                expect(retry).to_contain_text('再次发送')
                expect(retry).to_contain_text('可能计费')
                retry.click()
                expect(page.locator('#retry-job')).to_be_visible()
                assert len(calls) == attempts + 2
            page.locator('.dialog-close').click()

        # Configuration affordance is present in the error dialog and opens settings without demo output.
        mode['value'] = '401'
        page.locator('#generate').click()
        expect(page.locator('#api-error-settings')).to_contain_text('检查 API 配置')
        page.locator('#api-error-settings').click()
        expect(page.locator('#api-settings-form')).to_be_visible()
        assert page.locator('#result-grid .result-card').count() == original_count
        page.locator('.dialog-close').click()

        # Local preview updates as fields change, with no request; all key layouts fit at 375px.
        page.locator('#api-help').click()
        before = len(calls)
        page.locator('#api-base-url').fill('https://mock-api.example/v2')
        expect(page.locator('#api-request-preview')).to_contain_text('/v2/images/generations')
        assert len(calls) == before
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        assert page.locator('#dialog').evaluate('(e)=>e.scrollWidth <= e.clientWidth + 1')
        assert not errors, errors
        print(json.dumps({'passed': True, 'mock_requests': len(calls), 'checks': ['network/401/404/429/500/invalid-json-schema', 'safe dialog text', 'retry billing copy', 'configuration button', 'request preview without request', 'no demo fallback', '375px layout']}, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == '__main__':
    run()
