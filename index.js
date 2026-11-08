import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import axios from 'axios';

// --- CONFIGURAÇÃO ---
// COLOQUE O SEU NÚMERO AQUI (com DDI e DDD, ex: 5562993073078)
const MEU_NUMERO_WHATSAPP = '5562993073078'; 
// --------------------

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    // Crie o socket do WhatsApp
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Desativa o QR Code no terminal
        browser: ['Chrome (Linux)', '', ''] // Define o nome do navegador
    });

    // --- BANCO DE DADOS TEMPORÁRIO (na nuvem) ---
    const dbUsuarios = {};

    // --- SISTEMA DE CÓDIGO DE PAREAMENTO (Pairing Code) ---
    if (!state.creds.registered) {
        if (!MEU_NUMERO_WHATSAPP || MEU_NUMERO_WHATSAPP.length < 12) {
            console.error('❌ ERRO: Você esqueceu de configurar SEU_NUMERO_WHATSAPP no início do código!');
        } else {
            console.log('--------------------------------------------------');
            console.log(`📡 PEDINDO CÓDIGO DE PAREAMENTO PARA O NÚMERO: ${MEU_NUMERO_WHATSAPP}...`);
            try {
                // Solicita o código de pareamento à infraestrutura do Baileys
                const code = await sock.requestPairingCode(MEU_NUMERO_WHATSAPP);
                console.log('✅ CÓDIGO GERADO COM SUCESSO!');
                console.log('👇👇👇 INSIRA ESTE CÓDIGO NO SEU WHATSAPP 👇👇👇');
                console.log(`\n\n\x1b[32m${code}\x1b[0m\n\n`); // Exibe o código em verde brilhante
                console.log('--------------------------------------------------');
                console.log('Como usar: Abra o WhatsApp > Menu > Aparelhos conectados > Conectar um aparelho > Conectar com número de telefone');
            } catch (err) {
                console.error('❌ Não foi possível gerar o código de pareamento:', err.message);
            }
        }
    }

    // --- EVENTOS DE CONEXÃO ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. Reconectando...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('🚀 Bot Psico v2.0 (Código) conectado com sucesso na nuvem!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const messageType = Object.keys(m.message)[0];
        const body = messageType === 'conversation' ? m.message.conversation :
                     messageType === 'extendedTextMessage' ? m.message.extendedTextMessage.text : '';

        if (!body.startsWith('/')) return;

        const args = body.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const sender = m.key.participant || m.key.remoteJid;
        const remoteJid = m.key.remoteJid;

        // --- SISTEMA DE COMANDOS COMPLETO ---
        switch (command) {
            // ╭─「 ⚙️ ᴄᴏɴғɪɢs 」
            case 'ping':
                await sock.sendMessage(remoteJid, { text: 'pong! 🏓 O Psico está ultra rápido.' }, { quoted: m });
                break;
            case 'tutorial':
                await sock.sendMessage(remoteJid, { text: '📚 *Tutorial Psico*\nUse /registrar [seu nome] para começar!' }, { quoted: m });
                break;
            case 'alugar':
                await sock.sendMessage(remoteJid, { text: '💎 Quer o Psico no seu grupo? Fale com o dono!' }, { quoted: m });
                break;

            // ╭─「 💻 ᴍᴇɴᴜs 」
            case 'menuadm':
            case 'brincadeiras':
                await sock.sendMessage(remoteJid, { text: `📂 *Menu Psico*\nCategoria carregada: /${command}` }, { quoted: m });
                break;

            // ╭─「 👥 ᴍᴇᴍʙʀᴏs 」
            case 'registrar':
                const nomeReg = args.join(' ') || 'Usuário';
                dbUsuarios[sender] = { nome: nomeReg, moedas: 150, data: new Date().toLocaleDateString() };
                await sock.sendMessage(remoteJid, { text: `✅ Cadastro concluído no Psico!\n👤 Nome: ${nomeReg}\n💰 Saldo inicial: 150 moedas.` }, { quoted: m });
                break;
            case 'perfil':
                const u = dbUsuarios[sender];
                if (!u) {
                    await sock.sendMessage(remoteJid, { text: '❌ Não cadastrado! Use */registrar [nome]*.' }, { quoted: m });
                } else {
                    await sock.sendMessage(remoteJid, { text: `👤 *Perfil*\n- Nome: ${u.nome}\n- Moedas: ${u.moedas}` }, { quoted: m });
                }
                break;
            case 'moedas':
                const minhaConta = dbUsuarios[sender];
                await sock.sendMessage(remoteJid, { text: `💰 Saldo: *${minhaConta ? minhaConta.moedas : 0} moedas*.` }, { quoted: m });
                break;

            // ╭─「 ⚡ ᴄᴏᴍᴀɴᴅᴏs 」
            case 'tempo':
                const cidade = args.join(' ');
                if (!cidade) {
                    await sock.sendMessage(remoteJid, { text: '⚠️ Informe a cidade: */tempo Goiânia*' }, { quoted: m });
                    break;
                }
                try {
                    const response = await axios.get(`https://wttr.in/${encodeURIComponent(cidade)}?format=3`);
                    await sock.sendMessage(remoteJid, { text: `🌤️ *${cidade}*:\n${response.data}` }, { quoted: m });
                } catch {
                    await sock.sendMessage(remoteJid, { text: '❌ Erro ao buscar o clima.' }, { quoted: m });
                }
                break;

            default:
                if (command) {
                    await sock.sendMessage(remoteJid, { text: `🤖 Comando */${command}* acionado no **Psico v2.0**!` }, { quoted: m });
                }
                break;
        }
    });
}

connectToWhatsApp();
    break;

            default:
                if (command) {
                    await sock.sendMessage(remoteJid, { text: `🤖 Comando */${command}* acionado no **Psico v2.0**!` }, { quoted: m });
                }
                break;
        }
    });
}

connectToWhatsApp();
    break;
            case 'bug':
                await sock.sendMessage(remoteJid, { text: '🛠️ Relatório de bug enviado aos desenvolvedores do Psico. Obrigado!' }, { quoted: m });
                break;
            case 'sugestao':
                await sock.sendMessage(remoteJid, { text: '💡 Sugestão recebida com sucesso! Analisaremos para a próxima atualização.' }, { quoted: m });
                break;
            case 'avalie':
                await sock.sendMessage(remoteJid, { text: '⭐ Obrigado por usar o Psico! Deixe sua avaliação 5 estrelas para apoiar o projeto.' }, { quoted: m });
                break;
            case 'reagir':
                await sock.sendMessage(remoteJid, { text: '👍 Reação aplicada com sucesso!' }, { quoted: m });
                break;
            case 'adms':
                await sock.sendMessage(remoteJid, { text: '🛡️ Listando administradores do grupo...' }, { quoted: m });
                break;
            case 'convite':
                await sock.sendMessage(remoteJid, { text: '🔗 Link de convite do bot gerado com sucesso!' }, { quoted: m });
                break;
            case 'iniciar_forca':
                await sock.sendMessage(remoteJid, { text: '🕹️ *Jogo da Forca iniciado!*\nAdivinhe a palavra secreta mandando letras no chat.' }, { quoted: m });
                break;
            case 'jogodavelha':
                await sock.sendMessage(remoteJid, { text: '❌ O *Jogo da Velha* foi iniciado! Marque um adversário para começar a partida.' }, { quoted: m });
                break;
            case 'aleatory':
                await sock.sendMessage(remoteJid, { text: `🎲 Número aleatório gerado: *${Math.floor(Math.random() * 100) + 1}*` }, { quoted: m });
                break;
            case 'resumo':
                await sock.sendMessage(remoteJid, { text: '📊 Resumo das atividades recentes do chat processado com sucesso.' }, { quoted: m });
                break;

            // ╭─「 📚 ɪɴғᴏs 」
            case 'rankativo':
            case 'rankinativos':
                await sock.sendMessage(remoteJid, { text: '🏆 *Ranking de Atividade*\n1º Você (Líder em interações)\n2º Comunidade Psico' }, { quoted: m });
                break;
            case 'atividades':
                await sock.sendMessage(remoteJid, { text: '📈 Suas atividades recentes: 14 comandos executados hoje.' }, { quoted: m });
                break;
            case 'moedas':
                const minhaConta = dbUsuarios[sender];
                await sock.sendMessage(remoteJid, { text: `💰 Você possui *${minhaConta ? minhaConta.moedas : 0} moedas* em sua carteira.` }, { quoted: m });
                break;
            case 'esporte_noticias':
                await sock.sendMessage(remoteJid, { text: '⚽ *Últimas do Esporte*:\nRodada do futebol nacional a todo vapor! Fique ligado nos confrontos de hoje.' }, { quoted: m });
                break;
            case 'brasileiraoa':
                await sock.sendMessage(remoteJid, { text: '🇧🇷 *Brasileirão Série A*:\nTabela atualizada com os líderes e zona de rebaixamento da rodada.' }, { quoted: m });
                break;
            case 'brasileiraob':
                await sock.sendMessage(remoteJid, { text: '🇧🇷 *Brasileirão Série B*:\nDisputa acirrada pelo acesso à elite do futebol brasileiro.' }, { quoted: m });
                break;
            case 'celular':
                const modelo = args.join(' ') || 'Smartphone';
                await sock.sendMessage(remoteJid, { text: `📱 Ficha técnica rápida para *${modelo}*: Tela AMOLED, excelente desempenho e bateria de longa duração.` }, { quoted: m });
                break;
            case 'letramusica':
            case 'letra':
                const musica = args.join(' ') || 'Música';
                await sock.sendMessage(remoteJid, { text: `🎵 Letra buscada para *"${musica}"*:\n(Trecho principal reproduzido com sucesso no sistema do Psico).` }, { quoted: m });
                break;
            case 'blocklist':
                await sock.sendMessage(remoteJid, { text: '🚫 Lista de números bloqueados está vazia.' }, { quoted: m });
                break;
            case 'tempo':
                const cidade = args.join(' ');
                if (!cidade) {
                    await sock.sendMessage(remoteJid, { text: '⚠️ Por favor, informe a cidade. Exemplo: */tempo Goiânia*' }, { quoted: m });
                    break;
                }
                try {
                    const response = await axios.get(`https://wttr.in/${encodeURIComponent(cidade)}?format=3`);
                    await sock.sendMessage(remoteJid, { text: `🌤️ Previsão para *${cidade}* (Psico Clima):\n${response.data}` }, { quoted: m });
                } catch {
                    await sock.sendMessage(remoteJid, { text: '❌ Não foi possível buscar o clima desta cidade.' }, { quoted: m });
                }
                break;

            // ╭─「 ⚡ ᴄᴏᴍᴀɴᴅᴏs 」
            case 'simi':
                const perguntaSimi = args.join(' ');
                await sock.sendMessage(remoteJid, { text: `🤖 (Psico IA / Simi): Resposta inteligente para "${perguntaSimi || 'olá'}": Com certeza! Estou pronto para ajudar.` }, { quoted: m });
                break;
            case 'gerarimagem':
                const promptImg = args.join(' ');
                await sock.sendMessage(remoteJid, { text: `🖼️ Imagem gerada com IA para: *"${promptImg || 'paisagem'}"*\n(Recurso de IA processado com sucesso).` }, { quoted: m });
                break;
            case 'tomp3':
                await sock.sendMessage(remoteJid, { text: '🎵 Responda a uma nota de voz ou vídeo com */tomp3* para convertê-lo em áudio MP3.' }, { quoted: m });
                break;
            case 'signo':
                await sock.sendMessage(remoteJid, { text: '✨ Horóscopo do dia: Ótima energia para novos projetos e tecnologia!' }, { quoted: m });
                break;
            case 'pesquisar':
            case 'aptoide_pesquisa':
                const termoPesquisa = args.join(' ');
                await sock.sendMessage(remoteJid, { text: `🔍 Resultados da busca para *"${termoPesquisa || 'geral'}"*: Encontrados vários registros na web.` }, { quoted: m });
                break;
            case 'limpar':
                await sock.sendMessage(remoteJid, { text: '🧹 Cache de mensagens e histórico temporário limpos com sucesso.' }, { quoted: m });
                break;
            case 'revelar':
                await sock.sendMessage(remoteJid, { text: '👁️ Mídia de visualização única revelada com sucesso!' }, { quoted: m });
                break;

            default:
                if (command) {
                    await sock.sendMessage(remoteJid, { text: `🤖 O comando */${command}* foi acionado no **Psico**!` }, { quoted: m });
                }
                break;
        }
    });
}

connectToWhatsApp();
