const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='iroun.test'){
    const file=path.join(__dirname,'..',url.pathname);
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html'});
   }
   if(url.pathname.includes('supabase-js'))return route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){}},from(){const q={select:()=>q,order:()=>q,eq:()=>q,in:()=>q,range:()=>q,limit:()=>q,then:resolve=>Promise.resolve({data:[],error:null}).then(resolve)};return q;}})};`});
   return route.fulfill({contentType:'text/javascript',body:''});
  });
  await page.goto('https://iroun.test/admin.html');
  assert.equal(await page.locator('#login').isVisible(),true);
  await page.evaluate(async()=>{
   document.getElementById('login').classList.add('hidden');document.getElementById('app').classList.remove('hidden');
   state.orders=[{id:'mock',order_no:'TEST',ship_date:koreaDay(),order_status:'주문접수',receive_method:'택배',customer_name:'테스트 기관',order_items:[]}];
   await route('orders');
  });
  assert.match(await page.locator('#page').innerText(),/테스트 기관/);
  await page.evaluate(()=>route('settings'));assert.match(await page.locator('#page').innerText(),/생산계획/);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>route('orders'));
  assert.match(await page.locator('#page').innerText(),/TEST/);
  assert.deepEqual(errors,[]);
  console.log('Real administrator HTML: split assets, startup, order/settings routes and mobile viewport passed with mocked API; no production requests.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
