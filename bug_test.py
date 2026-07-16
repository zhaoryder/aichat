from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    logs = []
    page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
    page.on("pageerror", lambda err: logs.append(f"[PAGEERROR] {err}"))
    page.on("requestfailed", lambda req: logs.append(f"[REQFAIL] {req.url} {req.failure}"))

    # 注册
    page.goto('https://aichat-dgl.pages.dev/auth/register', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(1500)
    test_email = f'bug{int(time.time())}@test.com'
    page.fill('input[type=email]', test_email)
    page.fill('input[type=password]', 'Test123456!')
    # 昵称可能是第二个 input
    inputs = page.locator('input').all()
    for inp in inputs:
        ph = inp.get_attribute('placeholder') or ''
        if '字' in ph or '昵称' in ph or '名字' in ph:
            inp.fill('测试用户')
            break
    page.locator('button[type=submit]').first.click()
    page.wait_for_timeout(5000)
    print(f"注册后URL: {page.url}")

    token = page.evaluate("localStorage.getItem('sb-access-token') || localStorage.getItem('access_token')")
    print(f"Token: {bool(token)}")

    # 如果注册失败，尝试登录已存在账号
    if not token:
        print("注册失败，尝试登录...")
        page.goto('https://aichat-dgl.pages.dev/auth/login', wait_until='networkidle', timeout=30000)
        page.wait_for_timeout(1000)
        page.fill('input[type=email]', 'bugtest1752505601@test.com')
        page.fill('input[type=password]', 'Test123456!')
        page.locator('button[type=submit]').first.click()
        page.wait_for_timeout(5000)
        print(f"登录后URL: {page.url}")
        token = page.evaluate("localStorage.getItem('sb-access-token') || localStorage.getItem('access_token')")
        print(f"Token after login: {bool(token)}")

    # 去聊天页
    page.goto('https://aichat-dgl.pages.dev/chat/confucius', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)
    page.screenshot(path='/Users/ryder/Desktop/games/aichat/bug_chat.png')

    body = page.locator('body').text_content() or ''
    print(f"\n聊天页 body 长度: {len(body)}")
    print(f"body[:500]: {body[:500]}")

    # 检查页面元素
    ta = page.locator('textarea').all()
    print(f"textarea 数: {len(ta)}")
    headers = page.locator('h1').all()
    print(f"h1 数: {len(headers)}")

    if ta:
        ta[0].fill('你好')
        page.wait_for_timeout(500)
        send = page.locator("button[aria-label='发送消息']").first
        print(f"发送按钮可见: {send.is_visible()}")
        send.click()
        page.wait_for_timeout(5000)
        page.screenshot(path='/Users/ryder/Desktop/games/aichat/bug_after_send.png')
        body2 = page.locator('body').text_content() or ''
        print(f"\n发送后 body 长度: {len(body2)}")
        print(f"发送后 body[:500]: {body2[:500]}")

    print("\n=== 所有日志 ===")
    for l in logs:
        print(l)

    browser.close()
