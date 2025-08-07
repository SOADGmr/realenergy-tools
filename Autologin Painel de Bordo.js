// ==UserScript==
// @name         Login Automático - Painel de Bordo
// @namespace    marco.guedes.e259671.autologin
// @version      1.1
// @description  Realiza o login automático no Painel de Bordo da Cemig quando a sessão expira.
// @author       Marco Guedes
// @match        *https://geo.cemig.com.br/painel_de_bordo/
// @match        *https://geo.cemig.com.br/painel_de_bordo/Account*
// @match        *https://geo.cemig.com.br/painel_de_bordo/Account/Login*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURAÇÃO ---
    // IMPORTANTE: Substitua "SEU_USUARIO" e "SUA_SENHA" pelas suas credenciais.
    const USERNAME = "matricula";
    const PASSWORD = "senha";
    // --- FIM DA CONFIGURAÇÃO ---


    // IDs e seletores dos elementos do formulário de login, baseados no HTML da página.
    const USERNAME_FIELD_ID = 'usuario'; // ID do campo de usuário
    const PASSWORD_FIELD_ID = 'senha';   // ID do campo de senha
    const LOGIN_BUTTON_SELECTOR = 'button[type="submit"]'; // Seletor para o botão de "Entrar"

    // Intervalo para verificar se o formulário de login está visível (em milisseundos)
    const CHECK_INTERVAL = 3000; // 3 segundos

    /**
     * Função que tenta realizar o login.
     * Ela é executada repetidamente para detectar quando a página de login aparece.
     */
    function attemptLogin() {
        const usernameField = document.getElementById(USERNAME_FIELD_ID);
        const passwordField = document.getElementById(PASSWORD_FIELD_ID);
        const loginButton = document.querySelector(LOGIN_BUTTON_SELECTOR);

        // Verifica se todos os campos do formulário foram encontrados na página atual
        if (usernameField && passwordField && loginButton) {
            console.log("Formulário de login detectado. Preenchendo credenciais e logando...");

            // Preenche as credenciais configuradas acima
            usernameField.value = USERNAME;
            passwordField.value = PASSWORD;

            // Clica no botão de login para submeter o formulário
            loginButton.click();

        } else {
            // Se o formulário não for encontrado, informa no console (útil para depuração)
            // e continua verificando.
            console.log("Aguardando formulário de login...");
        }
    }

    // Inicia um intervalo que chama a função attemptLogin periodicamente.
    // O script continuará monitorando a página para o caso de a sessão expirar novamente.
    setInterval(attemptLogin, CHECK_INTERVAL);

})();
