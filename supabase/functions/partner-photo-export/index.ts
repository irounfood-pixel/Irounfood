import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {createPhotoExportHandler} from './core.mjs';
const sheetId='1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM';
const accessHash='fe8b5f40dbc6a149002ac70c685689efc409da9751484cd7f5fb84365a62f004';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
import {createManifestGateway} from './gateway.mjs';
function manifestGateway(){return createManifestGateway({sheetId,db});}
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(req=>createPhotoExportHandler({sheetId,accessHash,gateway:manifestGateway(),digest})(req));


