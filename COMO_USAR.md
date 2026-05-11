# 📱 Bot WhatsApp — Instruções de Uso

## Windows

1. **Extraia** a pasta do bot em qualquer lugar (ex: Área de Trabalho)
2. Dê **dois cliques** em `iniciar.bat`
3. Se aparecer aviso do Windows Defender → clique em **"Mais informações" → "Executar assim mesmo"**
4. Na primeira vez, o Node.js será instalado automaticamente (precisa de internet)
5. Quando aparecer o **QR code** no terminal:
   - Abra o WhatsApp no celular
   - Vá em **Aparelhos conectados → Conectar aparelho**
   - Escaneie o código
6. O dashboard abre automaticamente em **http://localhost:3000**

> ✅ Da segunda vez em diante, só dê dois cliques em `iniciar.bat` — sem QR, sem instalação.

---

## Mac / Linux

1. Abra o Terminal na pasta do bot
2. Execute:
   ```
   chmod +x iniciar.sh && ./iniciar.sh
   ```
3. Siga os mesmos passos do QR code acima

---

## Como usar o dashboard

| Ação | Como fazer |
|------|-----------|
| Ver conversas na fila | Clique em **"Fila"** na barra lateral |
| Assumir um atendimento | Abra a conversa → clique em **▶ Assumir Atendimento** |
| Responder o cliente | Digite na caixa de texto e pressione Enter |
| Encerrar atendimento | Clique em **✕ Encerrar** |

---

## Problemas comuns

**O bot parou de responder**
→ Feche e abra novamente o `iniciar.bat`

**Apareceu QR code de novo**
→ Normal após trocar de celular. Escaneie novamente.

**"Sessão encerrada" no terminal**
→ Delete a pasta `auth_info_baileys` e reinicie para reconectar

**Dashboard não abre**
→ Abra o navegador e acesse manualmente: http://localhost:3000
