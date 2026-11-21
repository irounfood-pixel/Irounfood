const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
for(const file of ['admin.html','customer.html','index.html','admin-test.html','admin-drive-test.html','ml/index.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  const src=m[1].match(/src="([^"]+)"/);
  if(src&&!/^https?:/.test(src[1])){
   const target=path.resolve(root,path.dirname(file),src[1].split('?')[0]);
   assert.ok(fs.existsSync(target),file+': missing '+src[1]);new vm.Script(fs.readFileSync(target,'utf8'),{filename:target});
  }else if(!src)new vm.Script(m[2],{filename:file});
 }
 for(const m of html.matchAll(/<link[^>]+href="([^"]+)"/g))if(!/^https?:/.test(m[1]))assert.ok(fs.existsSync(path.resolve(root,path.dirname(file),m[1].split('?')[0])));
}
const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
const scripts=[...html.matchAll(/<script src="(scripts\/admin\/[^?]+)[^"]*"/g)].map(m=>m[1]);
assert.equal(new Set(scripts).size,scripts.length,'Duplicate feature include');
assert.equal(scripts.at(-1),'scripts/admin/start.js','Authentication starts last');
new vm.Script(scripts.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n'));
console.log('Static checks passed: entry pages, local assets, JavaScript syntax, shared scope, startup order.');
