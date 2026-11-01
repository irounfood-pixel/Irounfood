import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {createPhotoExportHandler} from './core.mjs';
const sheetId='1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM';
const accessHash='48c94e428fe357deb2ff74e78bdc3c37543b0c80d301231a334f15da3b3e8de7';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
function manifestGateway(){let request;const manifest=()=>request||(request=db.rpc('ml_portal_photo_manifest').then(({data,error})=>{if(error||!data)throw Error('manifest error');return data;}));return {
 enabled:async id=>id===sheetId&&(await manifest()).enabled===true,
 approvedRows:async id=>{if(id!==sheetId)throw Error('scope');const rows=(await manifest()).rows;if(!Array.isArray(rows)||rows.length>20000)throw Error('source limit');return rows;},
 photos:async ids=>{const allowed=new Set(ids);return (await manifest()).photos.filter(p=>allowed.has(p.order_id));},
 sign:async(path,seconds)=>{const drive=path.match(/^[0-9a-f-]{36}\/drive\/([A-Za-z0-9_-]{10,200})$/i);if(drive)return 'drive:'+drive[1];const {data,error}=await db.storage.from('iroun-order-photos').createSignedUrl(path,seconds);if(error||!data?.signedUrl)throw Error('signing error');return data.signedUrl;}
 };}
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(req=>createPhotoExportHandler({sheetId,accessHash,gateway:manifestGateway(),digest})(req));

