from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # 收集控制台日志和错误
    logs = []
    page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
    page.on("pageerror", lambda err: logs.append(f"[PAGEERROR] {err}"))

    # 打开网站
    page.goto("https://aichat-dgl.pages.dev/", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    # 截图首页
    page.screenshot(path="/Users/ryder/Desktop/games/aichat/test_homepage.png", full_page=False)

    # 检查 h1 是否可见
    h1_elements = page.locator("h1").all()
    print(f"=== H1 elements count: {len(h1_elements)} ===")
    for i, h1 in enumerate(h1_elements):
        text = h1.text_content()
        is_visible = h1.is_visible()
        color = h1.evaluate("el => getComputedStyle(el).color")
        webkit_clip = h1.evaluate("el => getComputedStyle(el).webkitBackgroundClip")
        print(f"  h1[{i}]: text='{(text or '')[:50]}' visible={is_visible} color={color} bgClip={webkit_clip}")

    # 检查 --primary CSS 变量
    primary_val = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--primary')")
    print(f"\n=== --primary CSS var: '{primary_val}' ===")

    # 尝试注册测试账号
    print("\n=== 尝试注册 ===")
    test_email = f"testbug{int(time.time())}@test.com"
    test_pwd = "Test123456!"

    # 先看登录入口
    all_links = page.locator("a").all()
    for link in all_links:
        href = link.get_attribute("href") or ""
        text = (link.text_content() or "").strip()
        if text and ("login" in href.lower() or "登录" in text or "注册" in text):
            print(f"  Found link: text='{text}' href='{href}'")

    # 导航到注册
    page.goto("https://aichat-dgl.pages.dev/register", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1000)
    page.screenshot(path="/Users/ryder/Desktop/games/aichat/test_register.png")

    # 填写注册表单
    email_input = page.locator("input[type='email']").first
    pwd_input = page.locator("input[type='password']").first
    nick_input = page.locator("input[name='nickname'], input[placeholder*='昵称']").first

    if email_input.is_visible():
        if nick_input.is_visible():
            nick_input.fill("测试用户")
        email_input.fill(test_email)
        pwd_input.fill(test_pwd)
        # 点击注册
        reg_btn = page.locator("button[type='submit'], button:has-text('注册')").first
        if reg_btn.is_visible():
            print(f"注册中 email={test_email}")
            reg_btn.click()
            page.wait_for_timeout(5000)
            page.screenshot(path="/Users/ryder/Desktop/games/aichat/test_after_register.png")
            print(f"注册后URL: {page.url}")

    # 导航到聊天页
    print("\n=== 导航到聊天页 ===")
    page.goto("https://aichat-dgl.pages.dev/chat/confucius", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)
    page.screenshot(path="/Users/ryder/Desktop/games/aichat/test_chat.png")

    # 找到输入框
    textarea = page.locator("textarea").first
    if textarea.is_visible():
        print("找到输入框，输入消息...")
        textarea.fill("你好")
        page.wait_for_timeout(500)

        # 找发送按钮
        send_btn = page.locator("button[aria-label='发送消息'], button:has-text('发送')").first
        if send_btn.is_visible():
            print("点击发送按钮...")
            send_btn.click()
            page.wait_for_timeout(5000)
            page.screenshot(path="/Users/ryder/Desktop/games/aichat/test_after_send.png")
            print(f"发送后URL: {page.url}")
            body_text = page.locator("body").text_content() or ""
            print(f"body文本长度: {len(body_text)}")
            print(f"body前200字: {body_text[:200]}")
        else:
            print("未找到发送按钮")
    else:
        print("未找到输入框")

    # 打印所有错误日志
    print("\n=== 控制台错误日志 ===")
    for log in logs:
        if "PAGEERROR" in log or "[error]" in log.lower():
            print(log)

    print("\n=== 全部日志 ===")
    for log in logs:
        print(log)

    browser.close()
