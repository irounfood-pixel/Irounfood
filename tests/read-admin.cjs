const fs=require('node:fs'),path=require('node:path');
// Expand the real feature files in HTML load order for existing isolated VM tests.
module.exports=function readAdmin(file=path.join(__dirname,'../admin.html')){
 const html=fs.readFileSync(file,'utf8');
 return html.replace(/<script src="(scripts\/admin\/[^"]+)"><\/script>/g,(_,src)=>
  '<script>'+fs.readFileSync(path.resolve(path.dirname(file),src.split('?')[0]),'utf8')+'</script>');
};
