PAGGINS -> UTMIFY — SERVIÇO SEPARADO

Este projeto NÃO faz parte do app Lotto Money.
Ele é apenas uma ponte independente:

Paggins -> este serviço -> UTMify

PASSOS:
1. Crie um NOVO serviço/projeto separado no Railway chamado paggins-utmify.
2. Publique estes arquivos nesse serviço.
3. No Railway, adicione:
   UTMIFY_API_TOKEN=SEU_TOKEN_NOVO_DA_UTMIFY
4. Gere o domínio público do serviço.
5. Use esse domínio na Postback URL da Paggins.

Exemplo:
https://paggins-utmify-production.up.railway.app/paggins?cid={cid}&total_price={total_price}&amount_net={amount_net}&amount_gross={amount_gross}&currency={currency}&order_id={order_id}&order_date={order_date}&order_status={order_status}&customer_email={customer_email}&customer_name={customer_name}&customer_phone={customer_phone}&product_id={product_id}&product_name={product_name}&quantity={quantity}

Não altere o app/entregável.
