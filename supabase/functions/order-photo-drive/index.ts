import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createAdminDriveHandler} from './core.mjs';
const bridgeUrl='https://script.google.com/macros/s/AKfycbzi85enDr1GuIpCd4AhRdqfsqJs7TWu7ksVb2MlfN3p2DSoWRyCDXl9AfHq1rlN42dE/exec';
Deno.serve(createAdminDriveHandler({supabaseUrl:Deno.env.get('SUPABASE_URL')!,apiKey:Deno.env.get('SUPABASE_ANON_KEY')!,bridgeUrl}));
