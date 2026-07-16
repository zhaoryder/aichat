from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    logs = []
    page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
    page.on("pageerror", lambda err: logs.append(f"[PAGEERROR] {err}"))

    # 注册
    page.goto('https://aichat-dgl.pages.dev/auth/register', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(2000)
    test_email = f'fix{int(time.time())}@test.com'
    print(f"注册 email: {test_email}")
    page.fill('input[type=email]', test_email)
    page.fill('input[type=password]', 'Test123456!')
    # 昵称
    inputs = page.locator('input').all()
    for inp in inputs:
        ph = inp.get_attribute('placeholder') or ''
        if '字' in ph:
            inp.fill('测试用户')
            break
    page.locator('button[type=submit]').first.click()
    page.wait_for_timeout(6000)
    print(f"注册后URL: {page.url}")

    token = page.evaluate("localStorage.getItem('sb-access-token')")
    print(f"Token: {bool(token)}")

    if not token:
        # 检查错误信息
        error = page.locator('.text-red-500, [role=alert], .text-destructive').first
        if error.is_visible():
            print(f"注册错误: {error.text_content()}")

    # 去聊天页
    page.goto('https://aichat-dgl.pages.dev/chat/confucius', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)
    page.screenshot(path='/Users/ryder/Desktop/games/aichat/fix_chat.png')

    body = page.locator('body').text_content() or ''
    print(f"\n聊天页 body 长度: {len(body)}")

    ta = page.locator('textarea').all()
    print(f"textarea 数: {len(ta)}")

    if ta:
        ta[0].fill('你好')
        page.wait_for_timeout(500)
        send = page.locator("button[aria-label='发送消息']").first
        print(f"发送按钮可见: {send.is_visible()}")
        send.click()
        page.wait_for_timeout(8000)
        page.screenshot(path='/Users/ryder/Desktop/games/aichat/fix_after_send.png')
        body2 = page.locator('body').text_content() or ''
        print(f"发送后 body 长度: {len(body2)}")
        print(f"发送后 body[:500]: {body2[:500]}")
    else:
        print("未找到 textarea")

    print("\n=== 错误日志 ===")
    for l in logs:
        if "PAGEERROR" in l or "[error]" in l:
            print(l)

    browser.close()
