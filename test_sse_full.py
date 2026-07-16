#!/usr/bin/env python3
"""测试 AI 消息消失 - 拦截 fetch 读取完整 SSE 响应"""
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
    page.wait_for_timeout(5000)
    page.wait_for_load_state("networkidle")
    print(f"   登录后URL: {page.url}")

    if "auth" in page.url:
        print("   登录失败!")
        browser.close()
        import sys; sys.exit(1)

    print("\n3. 进入聊天页面")
    page.goto(f"{PRODUCTION_URL}/chat/confucius")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    print("\n4. 通过 apiStream 发送消息并读取完整 SSE 响应")
    # 在浏览器中执行：获取 token → fetch /api/chat → 读取完整 SSE 流
    sse_result = page.evaluate("""
        async () => {
            try {
                // 1. 获取 access token
                const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
                // 使用页面中已有的 supabase client
                // 直接从 localStorage 获取 session
                const sessionKey = Object.keys(localStorage).find(k => k.includes('auth-token') || k.includes('session'));
                let token = null;
                if (sessionKey) {
                    const session = JSON.parse(localStorage.getItem(sessionKey));
                    token = session?.access_token;
                }

                if (!token) {
                    return { error: 'No access token found in localStorage', keys: Object.keys(localStorage) };
                }

                // 2. 调用 /api/chat
                const resp = await fetch('/api/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token,
                    },
                    body: JSON.stringify({
                        conversationId: null,
                        agentId: 'confucius',
                        message: '你好',
                    }),
                });

                const result = {
                    status: resp.status,
                    statusText: resp.statusText,
                    contentType: resp.headers.get('content-type'),
                    body: '',
                };

                if (!resp.ok) {
                    result.body = await resp.text();
                    return result;
                }

                // 3. 读取 SSE 流
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
                    if (fullText.length > 20000) break;
                }
                result.body = fullText;
                result.chunkCount = chunkCount;
                return result;
            } catch (e) {
                return { error: e.message, stack: e.stack };
            }
        }
    """)

    print(f"\n   HTTP 状态: {sse_result.get('status')}")
    print(f"   Content-Type: {sse_result.get('contentType')}")
    print(f"   chunk 数: {sse_result.get('chunkCount', 'N/A')}")

    body = sse_result.get('body', '')
    if sse_result.get('error'):
        print(f"\n   错误: {sse_result['error']}")
        if sse_result.get('keys'):
            print(f"   localStorage keys: {sse_result['keys']}")

    print(f"\n   --- SSE 完整内容 ({len(body)} 字符) ---")
    for line in body.split('\n'):
        if line.strip():
            print(f"   {line}")
    print("   --- 结束 ---")

    print("\n页面JS错误:")
    for err in page_errors:
        print(f"  {err}")
    if not page_errors:
        print("  (无)")

    browser.close()
    print("\n验证完成")
