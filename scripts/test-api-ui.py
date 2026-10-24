"""Browser integration with mock HTTP responses; never calls a paid provider."""
import base64, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('GRAPHIC_TEST_URL', 'http://127.0.0.1:4206/')
ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64encode((ROOT/'public/assets/style-0.png').read_bytes()).decode()

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        context = browser.new_context(viewport={'width':1440,'height':1000}, accept_downloads=True)
        page = context.new_page(); errors=[]; calls=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        def respond(route):
            request = route.request
            if request.method == 'OPTIONS':
                route.fulfill(status=204, headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS'})
                return
            calls.append({'url':request.url,'headers':request.headers,'body':request.post_data_buffer})
            if request.url.endswith('/images/generations') or request.url.endswith('/images/edits'):
                body={'data':[{'b64_json':PNG}]}
            else:
                body={'items':[{'id':'mock-1','name':'API设计','imageUrl':'data:image/png;base64,'+PNG}]}
            route.fulfill(status=200, content_type='application/json', body=json.dumps(body), headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://mock-api.example/**', respond)
        page.goto(BASE)
        assert page.evaluate('GraphicAPI.status().demo')
        page.locator('#api-help').click()
        expect(page.locator('#api-key')).to_have_attribute('type','password')
        page.locator('#api-enabled').check()
        page.locator('#api-protocol').select_option('openai-images')
        page.locator('#api-base-url').fill('https://mock-api.example/v1')
        page.locator('#api-model').fill('mock-image-model')
        page.locator('#api-key').fill('test-placeholder-not-a-real-key')
        page.locator('#api-settings-form button[type=submit]').click()
        expect(page.locator('#api-settings-error')).to_contain_text('请先确认')
        page.locator('#api-consent').check()
        page.locator('#api-settings-form button[type=submit]').click()
        expect(page.locator('#dialog')).not_to_be_visible()
        assert not calls, 'save must not call API'
        assert not page.evaluate('GraphicAPI.status().demo')
        assert 'test-placeholder' not in page.evaluate('JSON.stringify(localStorage)')
        assert 'test-placeholder' not in page.evaluate('JSON.stringify(GraphicAPI.status())')
        assert page.locator('#api-key').input_value() == ''
        page.reload()
        assert not page.evaluate('GraphicAPI.status().demo'), 'same-tab reload should retain settings'
        page.locator('#brand').fill('云图 API')
        page.locator('#concept').fill('品牌概念')
        page.locator('#generate').click()
        expect(page.locator('#result-grid .result-card')).to_have_count(1)
        assert calls[-1]['url'].endswith('/v1/images/generations')
        payload=json.loads(calls[-1]['body'])
        assert payload['model']=='mock-image-model' and '云图 API' in payload['prompt']
        assert calls[-1]['headers']['authorization']=='Bearer test-placeholder-not-a-real-key'
        page.locator('#result-grid [data-open]').first.click()
        page.locator('#edit-prompt').fill('变得更简洁')
        page.locator('#apply-edit').click()
        expect(page.locator('#result-grid .result-card')).to_have_count(2)
        assert calls[-1]['url'].endswith('/v1/images/edits')
        assert 'multipart/form-data' in calls[-1]['headers']['content-type']
        assert b'name="image' in calls[-1]['body']
        page.locator('#export-tab').click()
        with page.expect_download() as download:
            page.locator('#export-now').click()
        assert download.value.suggested_filename.endswith('.png')
        page.locator('.dialog-close').click()
        page.locator('[data-tab="detail"]').click()
        page.locator('#ref-files').set_input_files(str(ROOT/'public/assets/style-4.png'))
        expect(page.locator('.reference-item')).to_have_count(1)
        page.locator('#generate').click()
        expect(page.locator('#result-grid .result-card')).to_have_count(3)
        assert calls[-1]['url'].endswith('/images/edits'), 'references must not be silently ignored'
        page.locator('[data-mode="vectorizer"]').click()
        expect(page.locator('#tool-generate')).to_be_disabled()
        page.locator('#api-help').click()
        page.locator('#api-protocol').select_option('graphic-json')
        page.locator('#api-base-url').fill('https://mock-api.example/graphic')
        page.locator('#api-key').fill('')
        page.locator('#api-vectorize-path').fill('/vectorize')
        page.locator('#api-consent').check()
        page.locator('#api-settings-form button[type=submit]').click()
        expect(page.locator('#tool-generate')).to_be_enabled()
        page.locator('#vector-file').set_input_files(str(ROOT/'public/assets/style-0.png'))
        expect(page.locator('#vector-before img')).to_be_visible()
        page.locator('#tool-generate').click()
        expect(page.locator('#tool-results .result-card')).to_have_count(1)
        assert calls[-1]['url'].endswith('/graphic/vectorize')
        assert json.loads(calls[-1]['body'])['tool']=='vectorize'
        assert 'authorization' not in calls[-1]['headers']
        # A provider failure must remain visible, must not silently create demo output.
        def failed(route):
            if route.request.method == 'OPTIONS':
                route.fulfill(status=204, headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS'})
            else:
                calls.append({'url':route.request.url,'headers':route.request.headers,'body':route.request.post_data_buffer})
                route.fulfill(status=401, content_type='application/json', body=json.dumps({'error':{'message':'do not echo test-placeholder-not-a-real-key'}}), headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://mock-api.example/**', failed)
        page.locator('[data-mode="logo"]').click()
        before = page.locator('#result-grid .result-card').count()
        attempts = len(calls)
        page.locator('#generate').click()
        expect(page.locator('#retry-job')).to_be_visible()
        expect(page.locator('#dialog-content')).to_contain_text('401')
        assert 'test-placeholder' not in page.locator('#dialog-content').inner_text()
        assert page.locator('#result-grid .result-card').count() == before
        assert len(calls) == attempts + 1
        page.locator('.dialog-close').click()
        page.locator('#api-help').click()
        for width in [375,768,1440]:
            page.set_viewport_size({'width':width,'height':850})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), width
            assert page.locator('#dialog').evaluate('(e)=>e.scrollWidth <= e.clientWidth+1'), width
        page.locator('#api-base-url').fill('https://user:pass@mock-api.example/v1')
        page.locator('#api-consent').check()
        page.locator('#api-settings-form button[type=submit]').click()
        expect(page.locator('#api-settings-error')).not_to_have_text('')
        page.locator('#api-clear').click()
        assert page.evaluate('GraphicAPI.status().demo')
        assert page.evaluate('GraphicAPISettings.get().apiKey') == ''
        assert 'test-placeholder' not in page.evaluate('JSON.stringify(localStorage)')
        assert 'test-placeholder' not in page.evaluate('JSON.stringify(sessionStorage)')
        page.locator('#api-help').click()
        page.locator('#api-enabled').check()
        page.locator('#api-protocol').select_option('comfyui-api')
        assert page.locator('#api-base-url').input_value() == 'http://127.0.0.1:8188'
        expect(page.locator('#api-workflow-status')).to_contain_text('尚未导入')
        workflow = {'10': {'class_type': 'MockNode', 'inputs': {'text': 'fixed workflow value'}}}
        page.locator('#api-workflow-file').set_input_files({
            'name': 'mock-api-workflow.json',
            'mimeType': 'application/json',
            'buffer': json.dumps(workflow).encode(),
        })
        expect(page.locator('#api-workflow-status')).to_contain_text('1 个节点')
        assert '提示词不会自动写入' in page.locator('#api-request-preview').inner_text()
        page.locator('#api-consent').check()
        before_comfy_save = len(calls)
        page.locator('#api-settings-form button[type=submit]').click()
        assert len(calls) == before_comfy_save, 'saving ComfyUI config must not send a request'
        assert page.evaluate('GraphicAPI.status().protocol') == 'comfyui-api'
        assert page.evaluate('GraphicAPI.status().operations.generate')
        assert not page.evaluate('GraphicAPI.status().operations.edit')
        assert page.evaluate('GraphicAPISettings.get().workflowJson').count('MockNode') == 1
        assert page.evaluate('GraphicAPISettings.get().apiKey') == ''
        page.locator('#api-help').click()
        page.locator('#api-clear').click()
        page.reload();assert page.evaluate('GraphicAPI.status().demo')
        assert not errors, errors
        print(json.dumps({'passed':True,'mock_api_requests':len(calls),'checks':['configuration and consent','save without request','session persistence','key excluded from localStorage/status/closed DOM','JSON generation','multipart edit and references','PNG export','unsupported operation disabled','Graphic JSON vectorize','ComfyUI API workflow import and save without request','URL validation','mobile settings','clear returns to demo','no JS errors']}, ensure_ascii=False, indent=2))
        browser.close()

if __name__=='__main__':run()
