import fetch from "node-fetch";

async function testPort(port: number) {
  const url = `http://localhost:${port}/api/health`;
  try {
    const res = await fetch(url);
    console.log(`Port ${port} /health status:`, res.status);
    const text = await res.text();
    console.log(`Port ${port} /health body:`, text.slice(0, 100));
  } catch (err) {
    console.log(`Port ${port} /health failed:`, (err as any).message);
  }
}

async function testRegister(port: number) {
  const url = `http://localhost:${port}/api/auth/register`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `test_${Date.now()}@example.com`,
        password: "password123",
        name: "Test User",
      }),
    });
    console.log(`Port ${port} /auth/register status:`, res.status);
    const json = await res.json();
    console.log(`Port ${port} /auth/register body:`, JSON.stringify(json));
  } catch (err) {
    console.log(`Port ${port} /auth/register failed:`, (err as any).message);
  }
}

async function run() {
  await testPort(3000);
  await testPort(4000);
  await testRegister(3000);
  await testRegister(4000);
}

run();
