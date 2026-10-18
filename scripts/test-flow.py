"""Optional local regression suite: python3 scripts/test-flow.py (requires Playwright + Chromium)."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE=os.environ.get('GRAPHIC_TEST_URL','http://127.0.0.1:4206/')
ROOT=Path(__file__).resolve().parents[1]

def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
        page=context.new_page(); errors=[]; requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:requests.append(r.url))
        page.goto(BASE); expect(page.locator('#generate')).to_be_visible()
        page.locator('#generate').click();expect(page.locator('#brand')).to_be_focused()
        page.locator('#brand').fill('云图 Studio');page.locator('#concept').fill('让每一份创意生长')
        page.locator('[data-tab="detail"]').click()
        page.locator('#ref-files').set_input_files(str(ROOT/'public/assets/style-4.png'))
        expect(page.locator('.reference-item')).to_have_count(1)
        page.locator('#description').fill('简洁、友好，避免复杂线条。')
        page.reload();page.locator('[data-tab="detail"]').click();expect(page.locator('.reference-item')).to_have_count(1)
        expect(page.locator('#description')).to_have_value('简洁、友好，避免复杂线条。')
        page.locator('[data-count="2"]').click();page.locator('#generate').click()
        expect(page.locator('#result-grid .result-card')).to_have_count(2)
        page.locator('#result-grid [data-open]').first.click()
        expect(page.locator('#edit-pane')).to_be_visible()
        page.locator('[data-edit-suggest="换成蓝色"]').click();page.locator('#apply-edit').click()
        expect(page.locator('#result-grid .result-card')).to_have_count(3)
        page.locator('#export-tab').click()
        with page.expect_download() as d:page.locator('#export-now').click()
        assert d.value.suggested_filename.endswith('.png')
        page.locator('.dialog-close').click()
        page.locator('[data-mode="appicon"]').click();expect(page.locator('#phone')).to_be_visible()
        page.locator('#tool-generate').click();expect(page.locator('#app-name')).to_be_focused()
        page.locator('#app-name').fill('Mellow');page.locator('#app-purpose').fill('呼吸与冥想')
        page.locator('[data-platform="android"]').click();expect(page.locator('#phone')).to_have_class('phone android')
        page.locator('[data-app-style="1"]').click();page.locator('#tool-generate').click()
        expect(page.locator('#tool-results .result-card')).to_have_count(1)
        page.locator('[data-mode="sketch"]').click();expect(page.locator('.sketch-drop')).to_be_hidden()
        canvas=page.locator('canvas');box=canvas.bounding_box();x=box['x']+box['width']*.3;y=box['y']+box['height']*.3
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+60,y+50,steps=8);page.mouse.up()
        def nonwhite():return canvas.evaluate('(c)=>{let d=c.getContext("2d").getImageData(0,0,800,800).data;for(let i=0;i<d.length;i+=4)if(d[i]<250)return true;return false}')
        assert nonwhite();page.locator('[data-action="undo"]').click();assert not nonwhite()
        page.locator('[data-action="redo"]').click();assert nonwhite()
        page.locator('#sketch-intent').fill('一片生长的叶子');page.locator('#tool-generate').click()
        expect(page.locator('#tool-results .result-card')).to_have_count(1)
        page.locator('[data-mode="mockup"]').click();page.locator('[data-sample="4"]').click()
        expect(page.locator('#mockup-stage svg')).to_be_visible()
        page.locator('[data-scene="bag"]').click();page.locator('#tool-generate').click()
        expect(page.locator('#tool-results .result-card')).to_have_count(1)
        page.locator('#pick-work').click();expect(page.locator('.pick-grid')).to_be_visible()
        page.locator('[data-pick]').first.click();expect(page.locator('#dialog')).not_to_be_visible()
        page.locator('[data-mode="vectorizer"]').click()
        page.locator('#vector-file').set_input_files(str(ROOT/'public/assets/style-0.png'))
        expect(page.locator('#vector-before img')).to_be_visible();page.locator('#tool-generate').click()
        expect(page.locator('#vector-after svg')).to_be_visible()
        page.locator('#works').click();expect(page.locator('#work-grid .result-card')).to_have_count(7)
        page.locator('#work-search').fill('Mellow');expect(page.locator('#work-grid .result-card')).to_have_count(1)
        page.locator('#work-grid [data-fav]').click();page.locator('#favorites-only').click();expect(page.locator('#work-grid .result-card')).to_have_count(1)
        page.locator('#login').click();expect(page.locator('.qr-demo')).to_be_visible()
        page.locator('#demo-consent').check();page.locator('#demo-enter').click();expect(page.locator('#login')).to_have_text('演示账户')
        page.locator('#login').click();page.locator('#account-plan').click();expect(page.locator('#dialog-content')).to_contain_text('支付、充值、订单、会员 API 均未接入');page.locator('#info-close').click()
        page.locator('[data-mode="logo"]').click();page.locator('#view-library').click();expect(page.locator('.catalog-card')).to_have_count(10)
        page.locator('#catalog-search').fill('不存在的测试');expect(page.locator('.catalog-card')).to_have_count(0)
        page.locator('#view-studio').click();page.locator('#generate').click();page.locator('#cancel-job').click()
        expect(page.locator('#dialog')).not_to_be_visible()
        assert page.evaluate('GraphicAPI.status().demo') is True
        assert all('/api/' not in url for url in requests), 'demo must not make business API requests'
        for width in [375,390,768,1280]:
            page.set_viewport_size({'width':width,'height':850})
            for route in ['logo','library','appicon','sketch','mockup','vectorizer','works','faq','blog','friends']:
                page.goto(BASE+'#/'+route);page.wait_for_timeout(50)
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'), (width,route,'overflow')
        assert not errors, errors
        print(json.dumps({'passed':True,'checks':['required fields','reference upload/persistence','project description','batch generation','editor variants','PNG download','App Icon preview/platform','sketch draw/undo/redo','mockup samples/scenes/works picker','SVG container','work filters/search/favorites','demo login','API unconfigured','cancel','catalog preserved','10 routes at 4 viewport sizes','no JS errors','no business API calls']},ensure_ascii=False,indent=2))
        browser.close()

if __name__=='__main__':run()
