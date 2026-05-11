# 🤖 Bot WhatsApp — Sistema de Atendimento

Bot de atendimento inicial com handoff para atendente humano.  
Feito com **Baileys** (Node.js) + dashboard web de gerenciamento.

---

## Como funciona

```
Cliente envia mensagem
       ↓
  Bot responde com saudação
  e coloca na fila (status: aguardando)
       ↓
  Atendente vê no dashboard
  e clica em "Assumir Atendimento"
       ↓
  Atendente conversa diretamente
  pelo dashboard
       ↓
  Atendente encerra a conversa
```

---

## Instalação

**Requisitos:** Node.js 18+

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar o bot
npm start
```

---

## Primeira conexão

1. O terminal exibirá um **QR code**
2. Abra o WhatsApp no celular
3. Vá em **Aparelhos conectados → Conectar aparelho**
4. Escaneie o QR code

A sessão é salva na pasta `auth_info_baileys/` — você **não** precisa escanear novamente a cada reinício.

---

## Dashboard

Acesse **http://localhost:3000** no navegador.

### Funcionalidades:
- 📊 **Estatísticas** em tempo real (fila, ativos, encerrados)
- 📋 **Lista de conversas** com filtros por status
- 💬 **Chat completo** com histórico de mensagens
- ▶️ **Assumir atendimento** com um clique
- ✕ **Encerrar conversa** com mensagem final opcional

---

## Status das conversas

| Status | Significado |
|--------|-------------|
| `bot` | Bot acabou de receber, ainda processando |
| `aguardando` | Na fila, esperando atendente |
| `humano` | Atendente assumiu |
| `encerrado` | Conversa finalizada |

---

## Personalização

Edite as mensagens em **`src/handler.js`**:

```js
const MSGS = {
  saudacao: (nome) => `Olá, ${nome}! Bem-vindo...`,
  aguardando: "Você já está em nossa fila...",
  // ...
}
```

---

## Estrutura do projeto

```
whatsapp-bot/
├── src/
│   ├── index.js      # Conexão Baileys + eventos
│   ├── handler.js    # Lógica do bot (mensagens automáticas)
│   ├── sessions.js   # Gerenciador de conversas/fila
│   └── dashboard.js  # Servidor web + API REST
├── auth_info_baileys/ # Sessão salva (não commitar!)
└── package.json
```

---

## ⚠️ Aviso

Esta implementação usa **engenharia reversa** da API interna do WhatsApp  
e viola os Termos de Uso. Para produção em escala, considere:

- **WhatsApp Business API** (oficial via Meta)
- **Z-API / WPPConnect** (proxies gerenciados)
- **Twilio for WhatsApp**

---

## Próximos passos sugeridos

- [ ] Integrar com IA (Claude/GPT) para responder FAQs automaticamente
- [ ] Adicionar menu numerado de opções
- [ ] Notificação sonora no dashboard quando nova mensagem chegar
- [ ] Persistência em banco de dados (SQLite/PostgreSQL)
- [ ] Múltiplos atendentes com autenticação
