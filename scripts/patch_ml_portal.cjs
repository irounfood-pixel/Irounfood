// Read an owner-exported Code.gs; keep the original photo/export/template implementation.
const fs=require('node:fs');
const path=require('node:path');
function patchMLPortal(source){
 if(source.includes('function manageMLPortalOrder('))throw Error('Already patched');
 let out=source.replace('function getMLPortalData(){','function getMLPortalDataLegacy_(){')
  .replace('function updateMLPortalOrder(','function updateMLPortalOrderLegacy_(');
 if(out===source)throw Error('Unknown server source');
 const mark='const ML_PORTAL_HTML_=',start=out.indexOf(mark);
 if(start<0)throw Error('Missing portal HTML');
 const html=JSON.parse(out.slice(start+mark.length).trim().replace(/;$/,''));
 const from=html.indexOf('const sourceRow=data.sourceRows?.[data.rows.indexOf(r)];');
 const to=html.indexOf("$('cards').appendChild(card);",from);
 if(from<0||to<0)throw Error('Unknown order card renderer');
 let patched=html.slice(0,from)+'const sourceRow=data.sourceRows?.[data.rows.indexOf(r)];if(sourceRow)appendMLOrderControls(card,sourceRow,r);'+html.slice(to);
 patched=patched.replace('승인된 주문 수정은 관리자에게 요청해 주세요.','승인된 주문은 승인 취소 후 수정할 수 있습니다.')
  .replace('완성된 주문은 최대 5분 안에 관리자 승인대기로 연동됩니다.','완성된 주문은 최대 5분 안에 등록 상태로 연동됩니다.')
  .replace('</script></body>',fs.readFileSync(path.join(__dirname,'../apps_script/ml_portal_order_actions.client.js'),'utf8')+'\n</script></body>');
 return out.slice(0,start)+fs.readFileSync(path.join(__dirname,'../apps_script/ml_portal_order_actions.gs'),'utf8')+'\n'+mark+JSON.stringify(patched)+';\n';
}
module.exports={patchMLPortal};
if(require.main===module){const [, ,input,output]=process.argv;if(!input||!output)throw Error('node patch_ml_portal.cjs original.gs patched.gs');fs.writeFileSync(output,patchMLPortal(fs.readFileSync(input,'utf8')));}
