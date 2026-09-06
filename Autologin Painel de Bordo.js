// ==UserScript==
// @name         Login Automático - Painel de Bordo
// @namespace    marco.guedes.e259671.autologin
// @version      2.1
// @description  Realiza o login automático no Painel de Bordo da Cemig quando a sessão expira.
// @author       Marco Antônio Guedes
// @match        https://geo.cemig.com.br/painel_de_bordo/Account*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // Sistema de "Heartbeat" (Batimento cardíaco)
    // Avisa outras abas (como o Painel de Bordo) que a tela de login está ativa e em foco
    function keepAlive() {
        localStorage.setItem('cemig_login_last_seen', Date.now().toString());
    }
    keepAlive(); // Chama imediatamente ao carregar
    setInterval(keepAlive, 5000); // Continua atualizando a cada 5 segundos

    // Chaves para salvar os dados
    const KEY_USER = "cemig_usuario_salvo";
    const KEY_PASS = "cemig_senha_salva";
    const KEY_ATTEMPT = "cemig_tentativa_login";

    window.addEventListener('load', function() {
        // Pega os dados salvos (se não existir, retorna vazio)
        let savedUser = GM_getValue(KEY_USER, "");
        let savedPass = GM_getValue(KEY_PASS, "");

        // Verifica se acabamos de tentar fazer um login
        let justAttempted = sessionStorage.getItem(KEY_ATTEMPT);

        if (justAttempted) {
            // Se tentou logar e a página recarregou na tela de login, a senha está errada!
            sessionStorage.removeItem(KEY_ATTEMPT); // Limpa a tentativa
            mostrarInterfaceAtualizacao(false); // Mostra o botão de atualizar
        } else if (savedUser !== "" && savedPass !== "") {
            // Se tem dados salvos e não falhou recentemente, tenta logar
            realizarLogin(savedUser, savedPass);
        } else {
            // Primeira vez usando o script (não tem dados salvos)
            mostrarInterfaceAtualizacao(true);
        }
    });

    // Função que preenche os campos e clica em Entrar
    function realizarLogin(usuario, senha) {
        let inputUser = document.getElementById('usuario');
        let inputPass = document.getElementById('senha');

        if(inputUser && inputPass) {
            inputUser.value = usuario;
            inputPass.value = senha;

            // Dispara o evento 'keyup' para o script original da página identificar se é "Contratada" ou não
            inputUser.dispatchEvent(new KeyboardEvent('keyup', {'key':'a'}));

            // Marca que estamos tentando logar
            sessionStorage.setItem(KEY_ATTEMPT, "true");

            // Clica no botão de login
            document.querySelector('.btn-signin').click();
        }
    }

    // Função que cria o botão e o formulário amigável na tela
    function mostrarInterfaceAtualizacao(primeiraVez) {
        let container = document.querySelector('.card-container');
        if(!container) return;

        // Se a senha estiver errada, mostra um aviso vermelho
        if (!primeiraVez) {
            let aviso = document.createElement('p');
            aviso.innerHTML = '<strong style="color:#d9534f;">Login falhou! A senha pode estar incorreta ou expirada.</strong>';
            aviso.style.textAlign = 'center';
            container.insertBefore(aviso, container.firstChild);
        }

        // Cria o botão "Mudei Minha Senha"
        let btnUpdate = document.createElement('button');
        btnUpdate.innerText = primeiraVez ? "Configurar Login Automático" : "Mudei Minha Senha";
        btnUpdate.className = "btn btn-lg btn-warning btn-block"; // Usa as classes nativas da página
        btnUpdate.style.marginTop = "15px";
        btnUpdate.style.fontSize = "14px";
        btnUpdate.style.padding = "0";

        // Ação ao clicar no botão
        btnUpdate.onclick = function(e) {
            e.preventDefault();
            btnUpdate.style.display = 'none'; // Esconde o botão

            // Cria um painelzinho para digitar a nova senha
            let formHtml = `
                <div id="painel-novas-creds" style="margin-top: 15px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9;">
                    <p style="text-align: center; font-weight: bold; margin-bottom: 10px;">Atualizar Credenciais</p>
                    <input type="text" id="novo_usuario" class="form-control" placeholder="Usuário" value="${GM_getValue(KEY_USER, "")}" style="margin-bottom: 10px;" required>
                    <input type="password" id="nova_senha" class="form-control" placeholder="Nova Senha" style="margin-bottom: 10px;" required>
                    <button id="btn_salvar_creds" class="btn btn-success btn-block">Salvar e Entrar</button>
                    <button id="btn_cancelar_creds" class="btn btn-default btn-block" style="margin-top:5px;">Cancelar</button>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', formHtml);

            // Ação do botão Salvar
            document.getElementById('btn_salvar_creds').onclick = function(ev) {
                ev.preventDefault();
                let userVal = document.getElementById('novo_usuario').value.trim();
                let passVal = document.getElementById('nova_senha').value.trim();

                if (userVal !== "" && passVal !== "") {
                    // Salva os dados no navegador de forma persistente
                    GM_setValue(KEY_USER, userVal);
                    GM_setValue(KEY_PASS, passVal);

                    // Remove o painel e tenta logar com os novos dados
                    document.getElementById('painel-novas-creds').remove();
                    realizarLogin(userVal, passVal);
                } else {
                    alert("Por favor, preencha o usuário e a senha.");
                }
            };

            // Ação do botão Cancelar
            document.getElementById('btn_cancelar_creds').onclick = function(ev) {
                ev.preventDefault();
                document.getElementById('painel-novas-creds').remove();
                btnUpdate.style.display = 'block'; // Mostra o botão amarelo de novo
            };
        };

        // Adiciona o botão ao final do card de login
        container.appendChild(btnUpdate);
    }

})();
