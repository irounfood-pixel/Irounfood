import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {createPhotoExportHandler} from './core.mjs';
const sheetId='1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM';
const accessHash='48c94e428fe357deb2ff74e78bdc3c37543b0c80d301231a334f15da3b3e8de7';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
import {createManifestGateway} from './gateway.mjs';
function manifestGateway(){return createManifestGateway({sheetId,db});}
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(req=>createPhotoExportHandler({sheetId,accessHash,gateway:manifestGateway(),digest})(req));


