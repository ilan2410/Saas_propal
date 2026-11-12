// Dedicated Node regression harness: imports real source, mocks all provider sinks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const pathModule = require('node:path');
const sourceRoot = pathModule.resolve(process.argv[2] || pathModule.join(__dirname, '../..'));
const ts = require('typescript');
const originalLoad = Module._load, originalResolve = Module._resolveFilename;
let mocks = Object.create(null);
Module._load = function (id, parent, main) {
  if (Object.hasOwn(mocks, id)) return mocks[id];
  return originalLoad.call(this, id, parent, main);
};
Module._resolveFilename = function (id, parent, ...rest) {
  return originalResolve.call(this, id.startsWith('@/') ? pathModule.join(sourceRoot, id.slice(2)) : id, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
function load(file, dependencies = {}) {
  mocks = Object.assign(Object.create(null), dependencies);
  const filename = require.resolve(pathModule.join(sourceRoot, file));
  delete require.cache[filename];
  return require(filename);
}
const { NextRequest } = require('next/server');
const owner = { organizationId: '11111111-1111-1111-1111-111111111111', role: 'owner', permissions: { view_credits_billing: true } };
const auth = { getUser: async () => ({ data: { user: { id: owner.organizationId } } }) };

test('strict monetary input and published bonus thresholds', () => {
  const { creditPurchase } = load('lib/stripe/credit-purchase.ts');
  for (const value of ['100', null, undefined, true, {}, [], NaN, Infinity, -10, 9.99, 10000.01, 10.001]) assert.equal(creditPurchase(value), null);
  for (const [amount, cents, credits] of [[10,1000,10],[99.99,9999,99.99],[100,10000,105],[250,25000,275],[500,50000,575],[1000,100000,1200],[10000,1000000,12000]]) {
    assert.equal(creditPurchase(amount).cents,cents); assert.equal(creditPurchase(amount).credits,credits);
  }
});
test('mapping rejects reserved segments without changing shared prototypes', () => {
  const { setNestedValue, getNestedValue } = load('lib/generators/data-utils.ts');
  for (const path of ['__proto__.manage_templates','constructor.prototype.manage_templates','client.__proto__.name']) {
    const value = {}; assert.throws(() => setNestedValue(value,path,'demo')); assert.deepEqual(value,{});
  }
  assert.equal(Object.hasOwn(Object.prototype,'manage_templates'),false);
  const inherited={client:{name:'original'}}, own=Object.create(inherited);
  setNestedValue(own,'client.name','updated');
  assert.equal(inherited.client.name,'original'); assert.equal(getNestedValue(own,'client.name'),'updated');
  assert.equal(getNestedValue(Object.create({secret:'hidden'}),'secret'),undefined);
});
test('organization context ignores inherited and non-boolean permission values', async () => {
  const { ownBooleanPermission, resolveOrgContext } = load('lib/auth/org-context.ts', {'@/lib/supabase/server':{createServiceClient(){throw Error('Unexpected service call');}}});
  assert.equal(ownBooleanPermission(Object.create({manage_templates:true}),'manage_templates'),undefined);
  assert.equal(ownBooleanPermission({manage_templates:'true'},'manage_templates'),undefined);
  assert.equal(ownBooleanPermission({manage_templates:false},'manage_templates'),false);
  const member={id:'member',organization_id:'org',user_id:'user',permissions_override:Object.create({manage_templates:true}),organizations:{commercial_default_permissions:{manage_templates:false}}};
  const client={from(table){const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='organization_members'?member:null})};return query;}};
  const context=await resolveOrgContext(client,{id:'user'});assert.equal(context.permissions.manage_templates,false);
});
test('post-auth navigation refuses cross-origin and ambiguous destinations', () => {
  const { sameOriginRedirect }=load('lib/security/safe-redirect.ts');
  for(const value of [null,'//other.test','/\\other.test','/\n/other.test','https://other.test','javascript:void(0)'])assert.equal(sameOriginRedirect(value,'https://app.test'),null);
  assert.equal(sameOriginRedirect('/propositions?q=demo#details','https://app.test'),'/propositions?q=demo#details');
});
test('document download enforces a streaming cap and exact-boundary acceptance',async()=>{
  const { readLimitedResponse }=load('lib/security/read-limited-response.ts',{'./validate-upload':{MAX_UPLOAD_SIZE_BYTES:50*1024*1024}});
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(3));c.enqueue(new Uint8Array(3));c.close();}});
  await assert.rejects(readLimitedResponse(new Response(stream),5),/trop volumineux/);
  assert.deepEqual(Array.from(new Uint8Array(await readLimitedResponse(new Response(new Uint8Array([1,2,3])),3))),[1,2,3]);
});
test('checkout rejects text before Stripe and prices numeric input canonically',async()=>{
  const calls=[]; const organization={id:owner.organizationId,stripe_customer_id:'cus_dummy',email:'owner@example.test',nom:'Demo'};
  const db={auth,from(){return{select(){return this;},eq(){return this;},single:async()=>({data:organization,error:null}),insert:async(value)=>{calls.push(['transaction',value]);return{error:null};}};}};
  class Stripe {checkout={sessions:{create:async(value)=>{calls.push(['stripe',value]);return{id:'cs_dummy',url:'https://checkout.example.test'};}}};}
  const {POST}=load('app/api/stripe/create-checkout-session/route.ts',{'stripe':Stripe,'@/lib/supabase/server':{createClient:async()=>db,createServiceClient:()=>db},'@/lib/auth/org-context':{resolveOrgContext:async()=>owner}});
  const request=montant=>new NextRequest('https://app.test/api/stripe/create-checkout-session',{method:'POST',body:JSON.stringify({montant})});
  assert.equal((await POST(request('100'))).status,400);assert.equal(calls.length,0);
  assert.equal((await POST(request(100))).status,200);
  assert.equal(calls[0][1].line_items[0].price_data.unit_amount,10000);assert.equal(calls[0][1].metadata.credits_total,'105');
  assert.equal(calls[1][1].credits_ajoutes,105);
});
test('webhook ignores inflated metadata, skips unpaid/replay, and retries settlement errors',async()=>{
  const calls=[];let rpcError=null,settled=true,cardCalls=0;
  const session={id:'cs_dummy',customer:'cus_dummy',payment_intent:'pi_dummy',client_reference_id:owner.organizationId,amount_total:10000,currency:'eur',payment_status:'paid',metadata:{source:'saas_propal_credits',organization_id:owner.organizationId,credits_total:'1005'}};
  class Stripe {webhooks={constructEvent:()=>({type:'checkout.session.completed',data:{object:session}})};paymentIntents={retrieve:async()=>{cardCalls++;return{payment_method:null};}};customers={update:async()=>{}};}
  const {POST}=load('app/api/stripe/webhook/route.ts',{'stripe':Stripe,'next/headers':{headers:async()=>new Headers({'stripe-signature':'dummy'})},'@supabase/supabase-js':{createClient:()=>({rpc:async(...args)=>{calls.push(args);return{data:settled,error:rpcError};}})}});
  const request=()=>new NextRequest('https://app.test/api/stripe/webhook',{method:'POST',body:'{}'});
  assert.equal((await POST(request())).status,200);assert.deepEqual(calls[0],['settle_credit_checkout',{p_session_id:'cs_dummy',p_organization_id:owner.organizationId,p_amount_cents:10000,p_customer_id:'cus_dummy',p_payment_intent_id:'pi_dummy'}]);
  session.payment_status='unpaid';assert.equal((await POST(request())).status,200);assert.equal(calls.length,1);
  session.payment_status='paid';settled=false;assert.equal((await POST(request())).status,200);assert.equal(cardCalls,1);
  rpcError={message:'dummy unavailable'};assert.equal((await POST(request())).status,500);
  rpcError=null;session.client_reference_id='other';const previous=calls.length;assert.equal((await POST(request())).status,500);assert.equal(calls.length,previous);
});
test('hidden proposition is rejected before upload validation or privileged storage/table writes',async()=>{
  let unexpected=0;const fail=()=>{unexpected++;throw Error('Unexpected side effect');};
  const {POST}=load('app/api/propositions/upload-documents/route.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth}),createServiceClient:()=>({from:fail})},
    '@/lib/auth/org-context':{resolveOrgContext:async()=>({...owner,role:'commercial',permissions:{view_all_propositions:false}})},
    '@/lib/propositions/note-access':{requireVisibleProposition:async()=>{throw Error('proposition_not_found');}},
    '@/lib/security/validate-upload':{validateUploadedFile:fail,safeStorageFileName:fail},
    '@/lib/ai/document-limits':{checkDocumentLimits:fail},'@/lib/ai/document-inspect':{inspectDocument:fail},
    '@/lib/propositions/source-documents':{SOURCE_DOCUMENTS_BUCKET:'documents'},
  });
  const form=new FormData();form.append('proposition_id','colleague');form.append('files',new File(['dummy'],'dummy.png'));
  assert.equal((await POST(new NextRequest('https://app.test/api/propositions/upload-documents',{method:'POST',body:form}))).status,404);assert.equal(unexpected,0);
});
