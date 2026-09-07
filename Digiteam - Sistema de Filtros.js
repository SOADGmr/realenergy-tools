// ==UserScript==
// @name         Digiteam - Injetor API (Motor Avançado v12)
// @namespace    http://tampermonkey.net/
// @version      12.0
// @description  Injeção de Rede com UI Dinâmica e Trava de Vazamento
// @match        *://*.digiteam.com.br/*
// @match        *://*.digiteam.cloud/*
// @match        *://localhost:*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/SOADGmr/realenergy-tools/refs/heads/main/Digiteam%20-%20Sistema%20de%20Filtros.js
// @downloadURL  https://raw.githubusercontent.com/SOADGmr/realenergy-tools/refs/heads/main/Digiteam%20-%20Sistema%20de%20Filtros.js
// ==/UserScript==

(function() {
    'use strict';

    console.log("🚀 [Digiteam Motor API v11] Iniciando interceptação profunda...");

    const STORAGE_KEY = 'digiteam_api_profiles_v11';
    let profiles = GM_getValue(STORAGE_KEY, {});

    // Puxa os perfis da V10 para não perder o que você gravou
    try {
        const oldProfiles = GM_getValue('digiteam_api_profiles_v10', null);
        if (Object.keys(profiles).length === 0 && oldProfiles) {
            profiles = oldProfiles;
            GM_setValue(STORAGE_KEY, profiles);
        }
    } catch(e) {}

    window._lastDigiteamPayload = null;
    window._activeProfileData = null;
    window._isInjectionActive = false;
    window._isDateInjectionActive = true; // Botão de Data ON por padrão
    window._isVencendoActive = false; // Botão de Vencimento OFF por padrão

    // Helper para calcular a janela de 6 meses
    function getSixMonthsRange() {
        const now = new Date();
        const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate(), 0, 0, 0, 0);
        return {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        };
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._interceptUrl = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        // Interceptamos qualquer chamada para os filtros do Angular (Seja /exec ou /count)
        if (this._interceptUrl && this._interceptUrl.includes('/api-v1/angular/orders/filter')) {
            if (body && typeof body === 'string') {
                try {
                    const parsedBody = JSON.parse(body);

                    // Só grava o Payload base quando é a rota oficial /exec, para termos dados confiáveis
                    if (this._interceptUrl.includes('/exec')) {
                        window._lastDigiteamPayload = JSON.parse(body);
                    }

                    // SE O MODO PERFIL ESTIVER SELECIONADO: Injeção de Rede
                    if (window._isInjectionActive && window._activeProfileData) {
                        const profile = window._activeProfileData;
                        const hackedPayload = { ...parsedBody };

                        // 1. Chaves de Paginação/Navegação que NUNCA copiamos do perfil (A tela comanda)
                        const protectedKeys = ['first', 'pageSize', 'positionQueryParam', 'view', 'sortField', 'desc', 'startDate', 'endDate']; // dateFieldFilter removido para poder ser salvo no perfil

                        // 2. BLINDAGEM CONTRA A TELA (Garante que Status/Região fantasmas não passem)
                        const listKeys = ['regionIdList', 'orderTypeIdList', 'agentIdList', 'motiveIdList', 'statusIdList', 'unitIdList'];
                        for (let lk of listKeys) {
                            hackedPayload[lk] = profile[lk] || [];
                        }

                        // 3. Injeta o resto das configurações do perfil (ex: texto de busca)
                        for (let key in profile) {
                            if (!protectedKeys.includes(key) && !listKeys.includes(key)) {
                                hackedPayload[key] = profile[key];
                            }
                        }

                        // 4. Regras de Data Customizadas (Sobrescrevem as Datas da Tela)
                        if (window._isDateInjectionActive) {
                            const range = getSixMonthsRange();
                            hackedPayload.startDate = range.startDate;
                            if (!window._isVencendoActive) {
                                hackedPayload.endDate = range.endDate;
                            }
                        }

                        if (window._isVencendoActive) {
                            hackedPayload.dateFieldFilter = 2; // Força "Data Limite"

                            const amanha = new Date();
                            amanha.setDate(amanha.getDate() + 1);
                            amanha.setHours(9, 0, 0, 0); // Exatamente às 09:00 de amanhã
                            hackedPayload.endDate = amanha.toISOString();

                            // Se a "Data: ON" de 6 meses estiver desligada, voltamos 10 anos para não perder nada atrasado
                            if (!window._isDateInjectionActive) {
                                const passado = new Date();
                                passado.setFullYear(passado.getFullYear() - 10);
                                hackedPayload.startDate = passado.toISOString();
                            }
                        }

                        console.log(`%c⚡ [INJETOR V12] Perfil aplicado na rota: ${this._interceptUrl}`, "color: #10b981; font-weight:bold;");

                        body = JSON.stringify(hackedPayload);
                    }
                } catch(e) {
                    console.error("[Injetor API] Erro ao processar payload:", e);
                }
            }
        }
        return originalSend.call(this, body);
    };

    GM_addStyle(`
        #dfp-action-bar {
            display: flex; gap: 8px; align-items: center; margin-right: auto; padding: 0 8px;
            background: transparent; border: none; z-index: 1000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        }

        #dfp-profile-select {
            background: #1e1e1e; color: #e4e4e7; border: 1px solid #3f3f46; border-radius: 6px;
            padding: 6px 12px; height: 34px; min-width: 220px; font-size: 13px; font-family: inherit;
            outline: none; cursor: pointer; transition: border-color 0.2s; appearance: auto;
        }
        #dfp-profile-select:hover, #dfp-profile-select:focus { border-color: #14b8a6; }

        .dfp-btn {
            border: none; border-radius: 6px; padding: 0 16px; height: 34px;
            font-weight: 500; font-size: 13px; font-family: inherit; cursor: pointer;
            transition: background-color 0.2s, filter 0.2s; color: white;
            display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .dfp-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .dfp-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }

        .dfp-btn-new { background: #3b82f6; } /* PrimeNG Blue */
        .dfp-btn-delete { background: #ef4444; display: none; } /* PrimeNG Danger Red */

        .dfp-btn-options {
            background: #1e1e1e; color: #e4e4e7; border: 1px solid #3f3f46;
            transition: border-color 0.2s, color 0.2s;
        }
        .dfp-btn-options:hover { border-color: #14b8a6; color: #fff; background: #27272a; }

        #dfp-status-msg { font-size: 12px; font-weight: 500; margin-left: 8px; min-width: 100px;}

        /* Dropdown Styles */
        .dfp-dropdown { position: relative; display: inline-block; }
        .dfp-dropdown-content {
            display: none; position: absolute; background-color: #18181b; min-width: 220px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5);
            z-index: 1001; border-radius: 6px; top: 38px; left: 0;
            border: 1px solid #3f3f46; overflow: hidden; padding: 4px 0;
        }
        .dfp-dropdown-content a {
            color: #d4d4d8; padding: 10px 16px; text-decoration: none; display: flex; justify-content: space-between;
            font-size: 13px; font-family: inherit; align-items: center; transition: background 0.1s, color 0.1s;
        }
        .dfp-dropdown-content a:hover { background-color: #27272a; color: #fff; }
        .dfp-dropdown-content hr { margin: 4px 0; border: none; border-top: 1px solid #3f3f46; }
        .dfp-show { display: block; }

        .badge-on { background: #14b8a6; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; color: #fff; }
        .badge-off { background: #3f3f46; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; color: #a1a1aa; }

        /* Modals Native PrimeNG Look */
        #dfp-modal-overlay {
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); backdrop-filter: blur(2px); z-index: 99999;
            align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        #dfp-modal-box {
            background: #18181b; border: 1px solid #3f3f46; border-radius: 8px; width: 350px;
            max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        }
        #dfp-modal-header {
            padding: 16px 20px; font-weight: 600; color: #f4f4f5; border-bottom: 1px solid #27272a;
            display: flex; justify-content: space-between; align-items: center; font-size: 15px;
        }
        #dfp-modal-close { cursor: pointer; color: #a1a1aa; font-size: 18px; border: none; background: transparent; padding: 0; line-height: 1;}
        #dfp-modal-close:hover { color: #f4f4f5; }
        #dfp-modal-list {
            overflow-y: auto; padding: 8px 0; margin: 0; list-style: none; flex-grow: 1;
        }
        .dfp-modal-item {
            padding: 10px 20px; display: flex; align-items: center; gap: 14px; cursor: pointer;
            color: #d4d4d8; transition: background 0.1s; font-size: 13px;
        }
        .dfp-modal-item:hover { background: #27272a; color: #fff;}
        .dfp-modal-item.selected { background: rgba(20, 184, 166, 0.1); color: #fff; }
        .dfp-cb {
            width: 18px; height: 18px; border: 2px solid #52525b; border-radius: 4px;
            display: flex; align-items: center; justify-content: center; transition: 0.1s;
            background: #18181b; flex-shrink: 0;
        }
        .dfp-modal-item.selected .dfp-cb {
            background: #14b8a6; border-color: #14b8a6;
        }
        .dfp-cb::after {
            content: ''; width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0;
            transform: rotate(45deg); display: none; margin-bottom: 2px;
        }
        .dfp-modal-item.selected .dfp-cb::after { display: block; }
        #dfp-modal-footer {
            padding: 16px 20px; border-top: 1px solid #27272a; display: flex; justify-content: flex-end; gap: 12px; background: #18181b; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;
        }
    `);

    function setStatusMsg(msg, color) {
        const statusEl = document.getElementById('dfp-status-msg');
        if (statusEl) {
            statusEl.textContent = msg;
            statusEl.style.color = color;
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        }
    }

    function forceAngularRefresh() {
        const refreshIcon = document.querySelector("body > app-root > app-layout > div > div.layout-content-wrapper > div > div:nth-child(1) > div > div.topbar-right > ul > li:nth-child(1) > a > i");

        if (refreshIcon) {
            refreshIcon.click();
            const parentA = refreshIcon.closest('a');
            if (parentA) parentA.click();
        } else {
            // Gatilho de Backup na barra de busca (se falhar)
            const possibleButtons = document.querySelectorAll('app-order-table button');
            for (let btn of possibleButtons) {
                if (btn.innerHTML.includes('pi-search')) { btn.click(); return; }
            }
        }
    }

    function toggleOriginalFilters(hide) {
        const container = document.querySelector('app-order-table .flex.justify-end.flex-wrap');
        if (!container) return;
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.id !== 'dfp-action-bar') {
                child.style.display = hide ? 'none' : '';
            }
        }
    }

    function updateSelectOptions() {
        const selectEl = document.getElementById('dfp-profile-select');
        if (!selectEl) return;

        const currentVal = selectEl.value;
        selectEl.innerHTML = '<option value="">⚙️ Modo de Criação de Perfil</option>';

        for (const name in profiles) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            selectEl.appendChild(opt);
        }

        // Lógica de Display Inteligente
        if (profiles[currentVal]) {
            selectEl.value = currentVal;
            document.getElementById('dfp-btn-delete').style.display = 'block';
            document.getElementById('dfp-btn-new').style.display = 'none';
        } else {
            selectEl.value = "";
            document.getElementById('dfp-btn-delete').style.display = 'none';
            document.getElementById('dfp-btn-new').style.display = 'block';
        }
    }

    function openProfileModal(title, profileKeys, onConfirm, confirmBtnText) {
        let overlay = document.getElementById('dfp-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'dfp-modal-overlay';
            document.body.appendChild(overlay);
        }

        const selected = new Set(profileKeys); // Por padrão, tudo vem marcado

        const renderList = () => {
            const allSelected = selected.size === profileKeys.length && profileKeys.length > 0;
            return `
                <li class="dfp-modal-item ${allSelected ? 'selected' : ''}" id="dfp-cb-all">
                    <div class="dfp-cb"></div>
                    <strong>Selecionar Todos</strong>
                </li>
                ${profileKeys.map(key => `
                    <li class="dfp-modal-item ${selected.has(key) ? 'selected' : ''}" data-key="${key}">
                        <div class="dfp-cb"></div>
                        <span>${key}</span>
                    </li>
                `).join('')}
            `;
        };

        overlay.innerHTML = `
            <div id="dfp-modal-box">
                <div id="dfp-modal-header">
                    <span>${title}</span>
                    <button id="dfp-modal-close">✖</button>
                </div>
                <ul id="dfp-modal-list">
                    ${renderList()}
                </ul>
                <div id="dfp-modal-footer">
                    <button id="dfp-modal-cancel" class="dfp-btn dfp-btn-options">Cancelar</button>
                    <button id="dfp-modal-confirm" class="dfp-btn dfp-btn-new">${confirmBtnText}</button>
                </div>
            </div>
        `;
        overlay.style.display = 'flex';

        // Ouvintes de clique na lista (Checkboxes visuais)
        const listEl = document.getElementById('dfp-modal-list');
        listEl.addEventListener('click', (e) => {
            const item = e.target.closest('.dfp-modal-item');
            if (!item) return;

            if (item.id === 'dfp-cb-all') {
                if (selected.size === profileKeys.length) selected.clear();
                else profileKeys.forEach(k => selected.add(k));
            } else {
                const key = item.getAttribute('data-key');
                if (selected.has(key)) selected.delete(key);
                else selected.add(key);
            }
            listEl.innerHTML = renderList(); // Recarrega com os novos itens selecionados
        });

        // Fechamento e Confirmação
        const close = () => overlay.style.display = 'none';
        document.getElementById('dfp-modal-close').onclick = close;
        document.getElementById('dfp-modal-cancel').onclick = close;

        document.getElementById('dfp-modal-confirm').onclick = () => {
            if (selected.size === 0) {
                const btn = document.getElementById('dfp-modal-confirm');
                const originalText = btn.textContent;
                btn.textContent = "Selecione algo!";
                btn.style.background = "#ef4444";
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = "";
                }, 2000);
                return;
            }
            onConfirm(Array.from(selected));
            close();
        };
    }

    function exportProfiles() {
        const keys = Object.keys(profiles);
        if (keys.length === 0) {
            setStatusMsg("Nenhum perfil para exportar", "#fbbf24");
            return;
        }

        openProfileModal("Exportar Perfis", keys, (selectedKeys) => {
            const dataToExport = {};
            selectedKeys.forEach(k => dataToExport[k] = profiles[k]);

            try {
                const dataStr = JSON.stringify(dataToExport, null, 2);
                const blob = new Blob([dataStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const date = new Date().toISOString().split('T')[0];
                a.download = `digiteam_perfis_${date}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setStatusMsg(`${selectedKeys.length} exportados!`, "#10b981");
            } catch(e) {
                setStatusMsg("Erro ao exportar", "#ef4444");
            }
        }, "Exportar Selecionados");
    }

    function importProfiles(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);
                if (typeof importedData === 'object' && importedData !== null) {
                    const keys = Object.keys(importedData);
                    if(keys.length === 0) {
                        setStatusMsg("Arquivo vazio", "#fbbf24");
                        return;
                    }

                    // Lê o arquivo JSON, mas pergunta antes de mesclar
                    openProfileModal("Importar Perfis", keys, (selectedKeys) => {
                        let importedCount = 0;
                        selectedKeys.forEach(k => {
                            profiles[k] = importedData[k];
                            importedCount++;
                        });
                        GM_setValue(STORAGE_KEY, profiles);
                        updateSelectOptions();
                        setStatusMsg(`${importedCount} importados!`, "#10b981");
                    }, "Importar Selecionados");

                } else {
                    setStatusMsg("Arquivo inválido", "#ef4444");
                }
            } catch (err) {
                setStatusMsg("Erro ao ler JSON", "#ef4444");
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reseta input para permitir importar o mesmo arquivo depois
    }

    function initUI() {
        if (document.getElementById('dfp-action-bar')) return;
        const containerDeFiltros = document.querySelector('app-order-table .flex.justify-end.flex-wrap');
        if (!containerDeFiltros) return;

        const topBar = document.createElement('div');
        topBar.id = 'dfp-action-bar';
        topBar.innerHTML = `
            <div class="dfp-dropdown">
                <button id="dfp-btn-options" class="dfp-btn dfp-btn-options" title="Configurações e Motores">
                    ⚙️ Opções <span style="font-size: 10px; margin-left: 4px;">▼</span>
                </button>
                <div id="dfp-options-menu" class="dfp-dropdown-content">
                    <a href="#" id="dfp-menu-date" title="Trava as ordens nos últimos 6 meses">
                        📅 Trava 6 Meses <span id="badge-date" class="badge-on">ON</span>
                    </a>
                    <a href="#" id="dfp-menu-vencendo" title="Filtra ordens com Data Limite até 09:00 de amanhã">
                        ⏳ Vencendo Amanhã <span id="badge-vencendo" class="badge-off">OFF</span>
                    </a>
                    <hr>
                    <a href="#" id="dfp-menu-export">📤 Exportar Perfis</a>
                    <a href="#" id="dfp-menu-import">📥 Importar Perfis</a>
                </div>
            </div>

            <input type="file" id="dfp-file-input" accept=".json" style="display: none;">

            <select id="dfp-profile-select" title="Alterne entre perfis salvos ou o Modo de Criação">
                <option value="">⚙️ Modo de Criação de Perfil</option>
            </select>
            <button id="dfp-btn-new" class="dfp-btn dfp-btn-new" title="Gravar o filtro que está sendo exibido agora">+ Salvar Perfil</button>
            <button id="dfp-btn-delete" class="dfp-btn dfp-btn-delete" title="Apagar perfil selecionado">- Deletar Perfil</button>
            <span id="dfp-status-msg"></span>
        `;

        containerDeFiltros.prepend(topBar);

        const btnOptions = document.getElementById('dfp-btn-options');
        const optionsMenu = document.getElementById('dfp-options-menu');
        const menuDate = document.getElementById('dfp-menu-date');
        const menuVencendo = document.getElementById('dfp-menu-vencendo');
        const badgeDate = document.getElementById('badge-date');
        const badgeVencendo = document.getElementById('badge-vencendo');
        const menuExport = document.getElementById('dfp-menu-export');
        const menuImport = document.getElementById('dfp-menu-import');
        const fileInput = document.getElementById('dfp-file-input');

        const selectEl = document.getElementById('dfp-profile-select');
        const btnNew = document.getElementById('dfp-btn-new');
        const btnDelete = document.getElementById('dfp-btn-delete');

        // Sincroniza badges com o estado global da janela
        badgeDate.className = window._isDateInjectionActive ? 'badge-on' : 'badge-off';
        badgeDate.textContent = window._isDateInjectionActive ? 'ON' : 'OFF';
        badgeVencendo.className = window._isVencendoActive ? 'badge-on' : 'badge-off';
        badgeVencendo.textContent = window._isVencendoActive ? 'ON' : 'OFF';

        // Eventos do Dropdown (Opções)
        btnOptions.addEventListener('click', (e) => {
            e.stopPropagation();
            optionsMenu.classList.toggle('dfp-show');
        });

        window.addEventListener('click', (e) => {
            if (!btnOptions.contains(e.target) && !optionsMenu.contains(e.target)) {
                optionsMenu.classList.remove('dfp-show');
            }
        });

        menuDate.addEventListener('click', (e) => {
            e.preventDefault();
            window._isDateInjectionActive = !window._isDateInjectionActive;
            badgeDate.className = window._isDateInjectionActive ? 'badge-on' : 'badge-off';
            badgeDate.textContent = window._isDateInjectionActive ? 'ON' : 'OFF';
            setStatusMsg(window._isDateInjectionActive ? "Trava 6M: Ligada" : "Datas liberadas", window._isDateInjectionActive ? "#3b82f6" : "#fbbf24");
            if (window._isInjectionActive) forceAngularRefresh();
        });

        menuVencendo.addEventListener('click', (e) => {
            e.preventDefault();
            window._isVencendoActive = !window._isVencendoActive;
            badgeVencendo.className = window._isVencendoActive ? 'badge-on' : 'badge-off';
            badgeVencendo.textContent = window._isVencendoActive ? 'ON' : 'OFF';
            setStatusMsg(window._isVencendoActive ? "Filtro 09h Ativado" : "Filtro 09h Desligado", window._isVencendoActive ? "#8b5cf6" : "#fbbf24");
            if (window._isInjectionActive) forceAngularRefresh();
        });

        menuExport.addEventListener('click', (e) => { e.preventDefault(); exportProfiles(); optionsMenu.classList.remove('dfp-show'); });
        menuImport.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); optionsMenu.classList.remove('dfp-show'); });
        fileInput.addEventListener('change', importProfiles);

        // EVENTO: MUDANÇA DE ESTADO (Lista Suspensa)
        selectEl.addEventListener('change', (e) => {
            const hasSelection = e.target.value !== "";

            if (hasSelection && profiles[e.target.value]) {
                // MODO: INJETANDO
                window._isInjectionActive = true;
                window._activeProfileData = profiles[e.target.value];
                btnNew.style.display = 'none';
                btnDelete.style.display = 'block';
                setStatusMsg(`⚡ Perfil Injetado`, "#10b981");
                toggleOriginalFilters(true); // Oculta os botões originais
                forceAngularRefresh();
            } else {
                // MODO: CRIAÇÃO
                window._isInjectionActive = false;
                window._activeProfileData = null;
                btnNew.style.display = 'block';
                btnDelete.style.display = 'none';
                setStatusMsg("Modo de Criação", "#fbbf24");
                toggleOriginalFilters(false); // Mostra os botões originais
                // Dá um refresh para a tela voltar a ler os dados limpos da Interface Real
                forceAngularRefresh();
            }
        });

        // GRAVAR PERFIL
        btnNew.addEventListener('click', () => {
            if (!window._lastDigiteamPayload) {
                setStatusMsg("Aperte a LUPA original do Digiteam primeiro para a rede ler os dados!", "#ef4444");
                return;
            }

            const name = window.prompt("Nome do novo Perfil:");
            if (name && name.trim() !== '') {
                const payloadToSave = JSON.parse(JSON.stringify(window._lastDigiteamPayload));

                // Limpeza de datas (mantemos o dateFieldFilter agora!)
                delete payloadToSave.startDate;
                delete payloadToSave.endDate;

                // STATUS PADRÃO: Se o usuário não selecionou nenhum status, injeta a lista predefinida
                if (!payloadToSave.statusIdList || payloadToSave.statusIdList.length === 0) {
                    payloadToSave.statusIdList = [20, 8, 10, 18, 14, 11, 1, 7, 9, 15, 3, 2, 21, 5, 19];
                }

                profiles[name.trim()] = payloadToSave;
                GM_setValue(STORAGE_KEY, profiles);

                updateSelectOptions();
                selectEl.value = name.trim();
                selectEl.dispatchEvent(new Event('change')); // Força a mudança e injeta na hora
            }
        });

        // DELETAR PERFIL
        btnDelete.addEventListener('click', () => {
            const name = selectEl.value;
            if(name && window.confirm(`Excluir o perfil '${name}'?`)) {
                if(window._activeProfileData === profiles[name]) {
                    window._activeProfileData = null;
                    window._isInjectionActive = false;
                }
                delete profiles[name];
                GM_setValue(STORAGE_KEY, profiles);
                updateSelectOptions();
                setStatusMsg("Excluído.", "#ef4444");
                toggleOriginalFilters(false); // Se deletou e voltou pro default, mostra os botões
                forceAngularRefresh(); // Recarrega para voltar aos dados da tela
            }
        });

        updateSelectOptions();

        // Garante que o visual dos botões originais obedeça ao estado atual no momento que a barra é renderizada
        toggleOriginalFilters(window._isInjectionActive);
    }

    document.addEventListener("DOMContentLoaded", () => {
        setInterval(() => {
            const targetContainer = document.querySelector('app-order-table .flex.justify-end.flex-wrap');
            if (targetContainer && !document.getElementById('dfp-action-bar')) {
                initUI();
            }
        }, 1500);
    });

})();
