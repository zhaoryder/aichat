#!/usr/bin/env python3
"""在浏览器中调用 /api/chat，捕获完整 SSE 响应"""
import json
import time
import urllib.request
import urllib.error

SUPABASE_URL = "https://jadxupuypxilxdwownyb.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphZHh1cHV5cHhpbHhkd293bnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDE2MTAsImV4cCI6MjA5OTE3NzYxMH0.aB46Vb5D2znV1DjwqsJZv8t2T8vK3_ms4Q5Vx3CBaxQ"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphZHh1cHV5cHhpbHhkd293bnliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzYwMTYxMCwiZXhwIjoyMDk5MTc3NjEwfQ.0sro3mUqhKxewzoK6vMEI_kY79L3XEEZAXZ1xukydpY"

PRODUCTION_URL = "https://aichat-dgl.pages.dev"
TEST_EMAIL = f"test_{int(time.time())}@test.com"
TEST_PASSWORD = "Test123456!"

print(f"测试账号: {TEST_EMAIL}")

# 1. 创建用户
print("\n1. 创建用户")
admin_url = f"{SUPABASE_URL}/auth/v1/admin/users"
admin_data = json.dumps({
    "email": TEST_EMAIL,
    "password": TEST_PASSWORD,
    "email_confirm": True,
    "user_metadata": {"nickname": "测试用户"}
}).encode()

req = urllib.request.Request(admin_url, data=admin_data, method="POST")
req.add_header("Authorization", f"Bearer {SERVICE_ROLE_KEY}")
req.add_header("apikey", SUPABASE_ANON_KEY)
req.add_header("Content-Type", "application/json")

try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        print(f"   成功: {result.get('id', 'unknown')}")
except urllib.error.HTTPError as e:
    print(f"   失败: {e.code} {e.read().decode()}")
    import sys; sys.exit(1)

# 2. Playwright 测试
from playwright.sync_api import sync_playwright

console_logs = []
page_errors = []

def on_console(msg):
    console_logs.append(f"[{msg.type}] {msg.text}")

def on_page_error(error):
    page_errors.append(str(error))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("console", on_console)
    page.on("pageerror", on_page_error)

    print("\n2. 登录")
    page.goto(f"{PRODUCTION_URL}/auth/login")
    page.wait_for_load_state("networkidle")
    page.locator('input[type="email"]').first.fill(TEST_EMAIL)
    page.locator('input[type="password"]').first.fill(TEST_PASSWORD)
    page.locator('button[type="submit"]').first.click()

    # 等待跳转
    page.wait_for_timeout(5000)
    page.wait_for_load_state("networkidle")
    print(f"   登录后URL: {page.url}")

    if "auth" in page.url:
        print("   登录失败!")
        print(f"   页面文本: {page.inner_text('body')[:200]}")
        browser.close()
        import sys; sys.exit(1)

    print("\n3. 在浏览器中直接调用 /api/chat 并读取 SSE 流")
    # 在浏览器页面中执行 fetch，读取 SSE 流
    sse_result = page.evaluate("""
        async () => {
            try {
                const resp = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationId: null,
                        agentId: 'confucius',
                        message: '你好',
                    }),
                });

                const result = {
                    status: resp.status,
                    statusText: resp.statusText,
                    headers: {},
                    body: '',
                };

                resp.headers.forEach((v, k) => { result.headers[k] = v; });

                if (!resp.ok) {
                    result.body = await resp.text();
                    return result;
                }

                // 读取 SSE 流
                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                let chunkCount = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    fullText += chunk;
                    chunkCount++;
                    if (fullText.length > 10000) break;  // 防止过长
                }
                result.body = fullText;
                result.chunkCount = chunkCount;
                return result;
            } catch (e) {
                return { error: e.message };
            }
        }
    """)

    print(f"   HTTP 状态: {sse_result.get('status')}")
    print(f"   Content-Type: {sse_result.get('headers', {}).get('content-type', 'N/A')}")
    print(f"   chunk 数: {sse_result.get('chunkCount', 'N/A')}")

    body = sse_result.get('body', '')
    print(f"\n   --- SSE 完整内容 ({len(body)} 字符) ---")
    # 打印所有事件
    for line in body.split('\n'):
        if line.strip():
            print(f"   {line}")
    print("   --- 结束 ---")

    if sse_result.get('error'):
        print(f"\n   错误: {sse_result['error']}")

    print("\n页面JS错误:")
    for err in page_errors:
        print(f"  {err}")
    if not page_errors:
        print("  (无)")

    browser.close()
    print("\n验证完成")
