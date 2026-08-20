PAGGINS -> UTMIFY BRIDGE V2

O QUE MUDOU:
- CID recebido da Paggins agora volta para a UTMify como SCK.
- Status em português e inglês são reconhecidos.
- Log mostra se CID chegou.
- O endpoint permanece /paggins.
- A URL de postback da Paggins NÃO precisa mudar.

NO RAILWAY:
Mantenha:
UTMIFY_API_TOKEN=seu token atual

Substitua os arquivos do repositório pelos arquivos deste pacote e faça redeploy.

POSTBACK URL DA PAGGINS:
https://paggins-utmify-production.up.railway.app/paggins?cid={cid}&total_price={total_price}&amount_net={amount_net}&amount_gross={amount_gross}&currency={currency}&order_id={order_id}&order_date={order_date}&order_status={order_status}&customer_email={customer_email}&customer_name={customer_name}&customer_phone={customer_phone}&product_id={product_id}&product_name={product_name}&quantity={quantity}

FLUXO:
UTMify gera SCK
-> página repassa SCK ao checkout
-> script da VSL duplica SCK como CID
-> Paggins recebe CID
-> Paggins dispara S2S
-> bridge recebe CID
-> bridge envia CID de volta como SCK para UTMify
