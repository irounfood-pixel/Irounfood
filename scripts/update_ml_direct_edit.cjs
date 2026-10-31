// Upgrade an owner-exported, already patched ML Code.gs. Keep photos/XLSX code intact.
const fs=require('node:fs'),path=require('node:path');
function updateMLDirectEdit(source){
 const mark='const ML_PORTAL_HTML_=',start=source.indexOf(mark),server=source.indexOf('/** Append to the existing private ML webapp');
 if(start<0||server<0)throw Error('Unknown patched ML source');
 let html=JSON.parse(source.slice(start+mark.length).trim().replace(/;$/,''));
 const a=html.indexOf('function appendMLOrderControls('),b=html.indexOf('</script>',a);
 if(a<0||b<0)throw Error('Missing order controls');
 html=html.slice(0,a)+fs.readFileSync(path.join(__dirname,'../apps_script/ml_portal_order_actions.client.js'),'utf8')+'\n'+html.slice(b);
 html=html.replaceAll('승인된 주문은 승인 취소 후 수정할 수 있습니다.','승인 후에도 수정·삭제할 수 있습니다.').replaceAll('승인된 주문 수정은 관리자에게 요청해 주세요.','승인 후에도 수정·삭제할 수 있습니다.');
 const out=source.slice(0,server)+fs.readFileSync(path.join(__dirname,'../apps_script/ml_portal_order_actions.gs'),'utf8')+'\n'+mark+JSON.stringify(html)+';\n';
 new (require('node:vm').Script)(out);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new(require('node:vm').Script)(match[1]);
 return out;
}
module.exports={updateMLDirectEdit};
if(require.main===module){const[,,input,output]=process.argv;fs.writeFileSync(output,updateMLDirectEdit(fs.readFileSync(input,'utf8')));}
