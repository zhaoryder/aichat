from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    logs = []
    page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
    page.on("pageerror", lambda err: logs.append(f"[PAGEERROR] {err}"))

    # 注册
    page.goto('http://localhost:5173/auth/register', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(1500)
    test_email = f'dev{int(time.time())}@test.com'
    page.fill('input[type=email]', test_email)
    page.fill('input[type=password]', 'Test123456!')
    inputs = page.locator('input').all()
    for inp in inputs:
        ph = inp.get_attribute('placeholder') or ''
        if '字' in ph:
            inp.fill('测试用户')
            break
    page.locator('button[type=submit]').first.click()
    page.wait_for_timeout(5000)
    print(f"注册后URL: {page.url}")
    token = page.evaluate("localStorage.getItem('sb-access-token')")
    print(f"Token: {bool(token)}")

    # 去聊天页
    page.goto('http://localhost:5173/chat/confucius', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)
    page.screenshot(path='/Users/ryder/Desktop/games/aichat/bug_dev_chat.png')

    body = page.locator('body').text_content() or ''
    print(f"聊天页 body 长度: {len(body)}")
    print(f"body[:300]: {body[:300]}")

    ta = page.locator('textarea').all()
    print(f"textarea 数: {len(ta)}")

    if ta:
        ta[0].fill('你好')
        page.wait_for_timeout(500)
        send = page.locator("button[aria-label='发送消息']").first
        print(f"发送按钮可见: {send.is_visible()}")
        send.click()
        page.wait_for_timeout(5000)
        page.screenshot(path='/Users/ryder/Desktop/games/aichat/bug_dev_after_send.png')
        body2 = page.locator('body').text_content() or ''
        print(f"发送后 body 长度: {len(body2)}")
        print(f"发送后 body[:500]: {body2[:500]}")

    print("\n=== 所有日志 ===")
    for l in logs:
        print(l)

    browser.close()
