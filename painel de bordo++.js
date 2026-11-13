// ==UserScript==
// @name         Painel de Bordo ++
// @namespace    marco.guedes.e259671
// @version      3.2.0
// @description  Painel corporativo avançado. Filtro silencioso nativo (Apenas SJ e LF).
// @author       Marco Guedes
// @match        *https://geo.cemig.com.br/painel_de_bordo/Geo/Clientes*
// @updateURL    https://raw.githubusercontent.com/SOADGmr/realenergy-tools/main/painel%20de%20bordo%2B%2B.js
// @downloadURL  https://raw.githubusercontent.com/SOADGmr/realenergy-tools/main/painel%20de%20bordo%2B%2B.js
// @grant        window.open
// ==/UserScript==

(function() {
    'use strict';

    /* ==========================================================================
       1. CONFIGURAÇÕES GERAIS E MAPEAMENTO DINÂMICO
       ========================================================================== */
    const DEFAULT_CONFIG = {
        panelTitle: 'Painel de Ocorrências Real',
        refreshIntervalMs: 120000,
        alarmAudioUrl: 'https://actions.google.com/sounds/v1/emergency/beeper_emergency_call.ogg',
        alarmVolume: 1.0,
        enableSound: true,
        enableCompLimit: true,
        enableMedium: true,
        enableLow: true,
        limits: {
            criticalClients: 100,
            criticalCompensation: 500,
            mediumClients: 50,
            lowClients: 5
        },
        visibleColumns: [
            { field: 'nmb', title: 'Serviço' },
            { field: 'tip', title: 'Tipo' },
            { field: 'nar', title: 'Alimentador' },
            { field: 'ncl', title: 'Clientes' },
            { field: 'tpe', title: 'Tempo' },
            { field: 'sta', title: 'Status' },
            { field: 'nve', title: 'Equipe' },
            { field: 'qch', title: 'CHI' },
            { field: 'nmu', title: 'Polo / Local' },
            { field: 'trr', title: 'Referência' }
        ],
        showLocalityCodeInTable: true
    };

    /* ==========================================================================
       2. GERENCIADOR DE ARMAZENAMENTO E HISTÓRICO DIÁRIO
       ========================================================================== */
    const StorageManager = {
        KEYS: {
            ACK_ALARMS: 'cemig_alarms_ack_v3',
            POLO_FILTERS: 'cemig_polo_filters_v3',
            USER_SETTINGS: 'cemig_user_settings_v3',
            DAILY_HISTORY: 'cemig_daily_history_v3',
            LOGIN_LAST_SEEN: 'cemig_login_last_seen',
            LOGIN_SUCCESS_SIGNAL: 'cemig_login_success_signal'
        },

        getTodayStr() { return new Date().toDateString(); },
        getTimeStr() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); },

        getSettings() {
            try {
                const saved = JSON.parse(localStorage.getItem(this.KEYS.USER_SETTINGS) || '{}');
                return {
                    ...DEFAULT_CONFIG,
                    ...saved,
                    limits: { ...DEFAULT_CONFIG.limits, ...(saved.limits || {}) }
                };
            } catch (e) { return DEFAULT_CONFIG; }
        },

        saveSettings(newSettings) { localStorage.setItem(this.KEYS.USER_SETTINGS, JSON.stringify(newSettings)); },
        isLoginPageOpen() { return (Date.now() - parseInt(localStorage.getItem(this.KEYS.LOGIN_LAST_SEEN) || '0', 10)) < 15000; },

        getAcknowledgedAlarms() {
            try {
                const parsed = JSON.parse(localStorage.getItem(this.KEYS.ACK_ALARMS) || 'null');
                if (parsed && parsed.date === this.getTodayStr()) return parsed.acknowledged || [];
            } catch (e) {}
            return [];
        },

        acknowledgeAlarm(sn) {
            const acks = this.getAcknowledgedAlarms();
            if (!acks.includes(sn)) {
                acks.push(sn);
                localStorage.setItem(this.KEYS.ACK_ALARMS, JSON.stringify({ date: this.getTodayStr(), acknowledged: acks }));
            }
        },

        getPoloFilters() {
            try {
                const saved = JSON.parse(localStorage.getItem(this.KEYS.POLO_FILTERS) || 'null');
                if (saved && typeof saved.sj === 'boolean') return saved;
            } catch (e) {}
            return { sj: true, lf: true };
        },

        savePoloFilters(sj, lf) { localStorage.setItem(this.KEYS.POLO_FILTERS, JSON.stringify({ sj: !!sj, lf: !!lf })); },

        getDailyHistory() {
            const today = this.getTodayStr();
            try {
                const parsed = JSON.parse(localStorage.getItem(this.KEYS.DAILY_HISTORY) || 'null');
                if (parsed && parsed.date === today && parsed.services) return parsed;
            } catch (e) {}
            const fresh = { date: today, services: {} };
            localStorage.setItem(this.KEYS.DAILY_HISTORY, JSON.stringify(fresh));
            return fresh;
        },

        saveDailyHistory(historyObj) { localStorage.setItem(this.KEYS.DAILY_HISTORY, JSON.stringify(historyObj)); },

        syncCriticalServicesHistory(trueAggregatedMap) {
            const history = this.getDailyHistory();
            const nowTime = this.getTimeStr();
            const settings = this.getSettings();
            let changed = false;

            Object.values(trueAggregatedMap).forEach(ad => {
                const sn = ad.nmb;
                const isCriticalNow = ad.nclSum >= settings.limits.criticalClients || (settings.enableCompLimit && ad.compSum >= settings.limits.criticalCompensation);
                const existing = history.services[sn];

                if (isCriticalNow) {
                    if (!existing) {
                        history.services[sn] = {
                            sn: sn, tipS: ad.tipS, pol: ad.pol, poloGroup: ad.poloGroup, loc: ad.loc, mun: ad.mun, nar: ad.nar,
                            initialClients: ad.nclSum, firstSeen: nowTime, lastSeen: nowTime, state: 'ACTIVE', dismissed: false,
                            lastChangeBadge: 'NOVA OCORRÊNCIA',
                            currentSnapshot: { nclSum: ad.nclSum, compSum: ad.compSum, chiSum: ad.chiSum, tpeSum: ad.tpeSum, statusText: ad.statusText, numV: ad.numV },
                            previousSnapshot: null,
                            timeline: [{ time: nowTime, event: `Início crítico detectado: ${ad.nclSum} clientes | Status: ${ad.statusText} | Equipe: ${ad.numV}` }]
                        };
                        changed = true;
                    } else {
                        const diffMessages = [];
                        if (existing.state !== 'ACTIVE') {
                            diffMessages.push('Retornou ao limite crítico');
                            existing.state = 'ACTIVE';
                            existing.dismissed = false;
                        }

                        const prev = existing.currentSnapshot;
                        if (prev.nclSum !== ad.nclSum) {
                            const tipo = ad.nclSum < prev.nclSum ? 'Redução' : 'Aumento';
                            diffMessages.push(`Clientes: ${prev.nclSum} → ${ad.nclSum} (${tipo})`);
                        }
                        if (prev.statusText !== ad.statusText) diffMessages.push(`Situação: ${prev.statusText} → ${ad.statusText}`);
                        if (prev.numV !== ad.numV) diffMessages.push(`Equipe: ${prev.numV} → ${ad.numV}`);

                        existing.lastSeen = nowTime;
                        existing.pol = ad.pol;
                        existing.loc = ad.loc;
                        existing.mun = ad.mun;
                        existing.nar = ad.nar;

                        if (diffMessages.length > 0) {
                            existing.previousSnapshot = { ...prev };
                            existing.currentSnapshot = { nclSum: ad.nclSum, compSum: ad.compSum, chiSum: ad.chiSum, tpeSum: ad.tpeSum, statusText: ad.statusText, numV: ad.numV };
                            existing.lastChangeBadge = diffMessages.join(' | ');
                            existing.timeline.push({ time: nowTime, event: diffMessages.join(' · ') + ` (CHI: ${ad.chiSum})` });
                            changed = true;
                        } else {
                            existing.currentSnapshot.compSum = ad.compSum;
                            existing.currentSnapshot.chiSum = ad.chiSum;
                            existing.currentSnapshot.tpeSum = ad.tpeSum;
                        }
                    }
                } else if (existing && existing.state === 'ACTIVE') {
                    // Caiu abaixo do limite crítico, mas ainda existe na tabela da CEMIG
                    existing.state = 'BELOW_LIMIT';
                    existing.previousSnapshot = { ...existing.currentSnapshot };
                    existing.currentSnapshot.nclSum = ad.nclSum;
                    existing.lastChangeBadge = `ABAIXO DO LIMITE (${ad.nclSum} CLI)`;
                    existing.timeline.push({ time: nowTime, event: `Abaixo do limite crítico (Restabelecimento parcial para ${ad.nclSum} clientes)` });
                    changed = true;
                }
            });

            // Só marca como NORMALIZADO se realmente sumiu dos dados da CEMIG
            Object.values(history.services).forEach(item => {
                if ((item.state === 'ACTIVE' || item.state === 'BELOW_LIMIT') && !trueAggregatedMap[item.sn]) {
                    item.state = 'NORMALIZED';
                    item.normalizedAt = nowTime;
                    const motivo = 'Normalizado / Encerrado (Saiu da tela)';
                    item.lastChangeBadge = motivo;
                    item.timeline.push({ time: nowTime, event: motivo });
                    changed = true;
                }
            });

            if (changed) this.saveDailyHistory(history);
            return history;
        },

        dismissNormalizedCard(sn) {
            const history = this.getDailyHistory();
            if (history.services[sn]) {
                history.services[sn].dismissed = true;
                this.saveDailyHistory(history);
            }
        }
    };

    /* ==========================================================================
       3. SISTEMA DE ALARME SONORO E VISUAL
       ========================================================================== */
    const AlarmSystem = {
        audio: null, visualInterval: null, isVisualActive: false,

        init() {
            const settings = StorageManager.getSettings();
            this.audio = new Audio(settings.alarmAudioUrl);
            this.audio.volume = settings.alarmVolume;
            document.title = settings.panelTitle;
        },

        updateVolume(vol) { if (this.audio) this.audio.volume = Math.max(0, Math.min(1, parseFloat(vol) || 1.0)); },

        trigger() {
            const settings = StorageManager.getSettings();
            if (!this.isVisualActive) {
                this.isVisualActive = true;
                let showWarning = true;
                this.visualInterval = setInterval(() => {
                    document.title = showWarning ? '🚨 ALERTA CRÍTICO! 🚨' : settings.panelTitle;
                    showWarning = !showWarning;
                }, 1000);
            }
            if (settings.enableSound && this.audio) {
                this.audio.volume = settings.alarmVolume;
                this.audio.play().catch(() => {});
            }
        },

        stop() {
            const settings = StorageManager.getSettings();
            if (this.isVisualActive) {
                this.isVisualActive = false;
                clearInterval(this.visualInterval);
                document.title = settings.panelTitle;
            }
            if (this.audio && !this.audio.paused) {
                this.audio.pause();
                this.audio.currentTime = 0;
            }
        },

        testSound() {
            if (this.audio) {
                const settings = StorageManager.getSettings();
                if (!settings.enableSound) return;
                this.audio.volume = settings.alarmVolume;
                this.audio.currentTime = 0;
                this.audio.play().catch(() => {});
            }
        }
    };

    /* ==========================================================================
       4. ESTILOS CORPORATIVOS E COMPATIBILIDADE DATATABLES 3
       ========================================================================== */
    function injectStyles() {
        if (document.getElementById('re-enterprise-styles')) return;

        const style = document.createElement('style');
        style.id = 're-enterprise-styles';
        style.textContent = `
            :root {
                --re-bg-base: #18191a;
                --re-bg-surface: #242526;
                --re-bg-elevated: #2f3031;
                --re-border: #3a3b3c;
                --re-text-primary: #e4e6eb;
                --re-text-secondary: #b0b3b8;
                --re-accent-blue: #1a73e8;
                --re-critical-bg: #2d1416;
                --re-critical-unack-bg: #7f1d1d;
                --re-critical-border: #ef4444;
                --re-medium-bg: #2e1d0f;
                --re-medium-border: #f97316;
                --re-low-bg: #2b2611;
                --re-low-border: #eab308;
                --re-ok-green: #22c55e;
            }

            html, body {
                margin: 0 !important; padding: 0 !important;
                background-color: var(--re-bg-base) !important; color: var(--re-text-primary);
                font-family: 'Roboto', 'Segoe UI', sans-serif !important;
                overflow-x: hidden !important; width: 100% !important;
                padding-top: 68px !important;
            }

            /* Oculta elementos originais desnecessários e a linha superior vazia do DataTables 3 */
            .col-md-6.text-center,
            #imgLogoTI,
            #tabela-de-dados-clientes_processing,
            .dt-processing {
                display: none !important;
            }

            /* IMPORTANTE PARA DATATABLES 3: Oculta a 1ª linha (Projeção CHI) via CSS sem removê-la do DOM para não quebrar o titleRow: 1 */
            #tabela-de-dados-clientes > thead > tr:first-child,
            table.dataTable.fixedHeader-floating > thead > tr:first-child,
            .dt-fixedheader > thead > tr:first-child {
                display: none !important;
            }

            /* Oculta a barra de topo original do DataTables 3 após movermos os botões para o Navbar */
            .dt-container > .dt-layout-row:first-child {
                display: none !important;
            }

            /* Navbar Fixo no Topo */
            nav.navbar.navbar-default {
                background-color: var(--re-bg-surface) !important;
                border: none !important; border-bottom: 1px solid var(--re-border) !important;
                border-radius: 0 !important; min-height: 68px !important; padding: 8px 16px !important;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
                position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; width: 100vw !important;
                z-index: 1050 !important; margin: 0 !important;
            }

            #re-navbar-container { display: flex; align-items: center; justify-content: space-between; width: 100%; position: relative; min-height: 50px; }
            .re-nav-left, .re-nav-right { display: flex; align-items: center; gap: 8px; z-index: 2; }
            .re-nav-right { justify-content: flex-end; }

            /* Título Centralizado Absoluto na Tela */
            .re-nav-center {
                position: absolute; left: 50%; transform: translateX(-50%);
                display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 1;
                pointer-events: none;
            }
            .re-nav-center * { pointer-events: auto; }

            #aTitle { font-size: 18px !important; font-weight: 700 !important; color: var(--re-text-primary) !important; text-transform: uppercase; text-decoration: none !important; margin: 0; padding: 0; letter-spacing: 0.5px; }
            .re-status-bar { display: flex; gap: 10px; font-size: 12px; }
            #dvAtualizacao { background-color: var(--re-bg-elevated) !important; color: var(--re-text-secondary) !important; padding: 4px 10px !important; border-radius: 4px !important; border: 1px solid var(--re-border); font-weight: 500; }
            #dvStatus { background-color: #dc2626 !important; color: #ffffff !important; padding: 4px 12px !important; border-radius: 4px !important; font-weight: 600; animation: re-pulse 1.5s infinite; }
            @keyframes re-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.65; } }

            .re-btn, .excel_button {
                display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                background-color: var(--re-bg-elevated) !important; color: var(--re-text-primary) !important;
                border: 1px solid var(--re-border) !important; border-radius: 6px !important; height: 38px !important; padding: 0 14px !important;
                font-size: 13px !important; font-weight: 600 !important; cursor: pointer; transition: 0.15s; margin: 0 !important;
            }
            .re-btn:hover, .excel_button:hover { background-color: #3a3b3c !important; border-color: #525355 !important; }

            .re-polo-group { display: flex; align-items: center; gap: 6px; background-color: var(--re-bg-base); padding: 3px; border-radius: 7px; border: 1px solid var(--re-border); }
            .polo-btn { display: inline-flex; align-items: center; gap: 6px; background-color: transparent; color: var(--re-text-secondary); border: none; border-radius: 5px; height: 32px; padding: 0 11px; font-size: 12px; font-weight: 700; cursor: pointer; }
            .polo-btn .led-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #ef4444; box-shadow: 0 0 4px rgba(239, 68, 68, 0.6); }
            .polo-btn.active { background-color: var(--re-bg-elevated); color: #ffffff; }
            .polo-btn.active .led-dot { background-color: #22c55e; box-shadow: 0 0 6px rgba(34, 197, 94, 0.8); }

            .dt-search, #tabela-de-dados-clientes_filter { margin: 0 !important; display: flex; align-items: center; }
            .dt-search label, #tabela-de-dados-clientes_filter label { margin: 0 !important; font-weight: normal; }
            input#Filter {
                background-color: var(--re-bg-base) !important; color: var(--re-text-primary) !important;
                border: 1px solid var(--re-border) !important; border-radius: 6px !important;
                height: 38px !important; width: 170px !important; padding: 0 12px !important; font-size: 13px !important;
                outline: none !important;
            }
            input#Filter:focus { border-color: var(--re-accent-blue) !important; }

            /* Faixas de Alerta - Grid 3 Colunas (1fr auto 1fr) para Centralização Matemática */
            #re-alerts-wrapper { padding: 10px 16px 4px 16px; display: flex; flex-direction: column; gap: 8px; }
            .re-alert-section { display: flex; flex-direction: column; gap: 4px; }
            .re-alert-section:empty { display: none !important; }

            .re-alert-row {
                display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
                gap: 16px; padding: 9px 14px; border-radius: 5px; font-size: 13px;
                border: 1px solid rgba(255, 255, 255, 0.08); position: relative;
            }
            .re-alert-left { justify-self: start; display: flex; align-items: center; gap: 12px; }
            .re-alert-center { justify-self: center; display: flex; align-items: center; gap: 10px; }
            .re-alert-right { justify-self: end; display: flex; align-items: center; gap: 16px; }

            .level-critical-unack { background-color: var(--re-critical-unack-bg); border-left: 5px solid #ff5252; color: #ffffff; }
            .level-critical-ack { background-color: var(--re-critical-bg); border-left: 4px solid var(--re-critical-border); color: #fecaca; }
            .level-medium { background-color: var(--re-medium-bg); border-left: 4px solid var(--re-medium-border); color: #fed7aa; }
            .level-low { background-color: var(--re-low-bg); border-left: 4px solid var(--re-low-border); color: #fef08a; }
            .re-normal-banner { background-color: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.3); border-left: 4px solid var(--re-ok-green); color: #bbf7d0; padding: 10px 16px; border-radius: 5px; font-size: 13px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; }

            .ack-btn { background-color: #b91c1c; color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 4px; padding: 5px 12px; font-weight: 700; font-size: 12px; cursor: pointer; }
            .ack-btn:hover { background-color: #991b1b; }
            .re-ack-status { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; background-color: rgba(255, 255, 255, 0.08); color: var(--re-text-secondary); }

            .re-alert-id { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; color: #ffffff; white-space: nowrap; }
            .re-polo-badge { font-size: 11px; padding: 2px 6px; border-radius: 3px; background-color: rgba(255, 255, 255, 0.15); color: #ffffff; }

            .re-alert-location { display: flex; align-items: center; gap: 8px; font-weight: 600; white-space: nowrap; }
            .re-alert-location .re-alim { color: rgba(255, 255, 255, 0.75); font-size: 12px; background-color: rgba(0, 0, 0, 0.25); padding: 2px 7px; border-radius: 4px; }

            .re-metric-pill {
                background-color: rgba(0, 0, 0, 0.38); border: 1px solid rgba(255, 255, 255, 0.12);
                padding: 5px 12px; border-radius: 4px; font-size: 14px; letter-spacing: 0.4px;
                font-family: 'Consolas', 'Roboto Mono', 'Courier New', monospace; color: #f3f4f6;
            }
            .re-metric-pill strong { font-size: 15px; font-weight: 700; color: #ffffff; }

            .re-row-action-btn { background-color: rgba(255, 255, 255, 0.1); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 4px; padding: 5px 12px; font-size: 12px; font-weight: 600; cursor: pointer; text-transform: uppercase; transition: 0.15s; }
            .re-row-action-btn:hover { background-color: rgba(255, 255, 255, 0.2); }

            /* Tabela e Cabeçalho Fixo (Compatível com DataTables 1.10 e DataTables 3) */
            .row { margin-left: 0 !important; margin-right: 0 !important; }
            .col-md-12.col-lg-12 { padding-left: 16px !important; padding-right: 16px !important; }
            .dt-container, .dataTables_wrapper {
                background-color: var(--re-bg-surface) !important; border: 1px solid var(--re-border);
                border-radius: 6px; padding: 0 !important; width: 100% !important; margin-top: 6px;
            }
            .dt-layout-table, .dt-layout-table > .dt-layout-cell { padding: 0 !important; margin: 0 !important; width: 100% !important; }
            #tabela-de-dados-clientes { width: 100% !important; margin: 0 !important; table-layout: auto !important; background-color: #ffffff; color: #1f2937; }

            table.dataTable thead th,
            table.dataTable.fixedHeader-floating thead th,
            table.dataTable.fixedHeader-locked thead th,
            .dt-fixedheader thead th {
                background-color: #2b2d30 !important; color: #e5e7eb !important;
                border: 1px solid #3f4146 !important; height: 38px;
                font-size: 12px !important; font-weight: 600 !important;
                text-transform: uppercase; text-align: center !important;
            }

            table.dataTable.fixedHeader-floating,
            .dt-fixedheader {
                top: 68px !important; z-index: 1040 !important;
                background-color: var(--re-bg-surface) !important;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4) !important;
            }

            #tabela-de-dados-clientes tbody td { font-size: 13px !important; padding: 7px 8px !important; border: 1px solid #e5e7eb !important; text-align: center; }
            #tabela-de-dados-clientes tfoot tr, #tabela-de-dados-clientes tfoot th, #tabela-de-dados-clientes tfoot td { background-color: #2b2d30 !important; border: 1px solid #3f4146 !important; padding: 3px !important; }
            #tabela-de-dados-clientes tfoot input.form-control { background-color: #18191a !important; border: 1px solid #3f4146 !important; border-radius: 4px !important; color: #e4e6eb !important; height: 28px !important; width: 100% !important; font-size: 12px !important; }

            /* Rodapé de paginação do DataTables 3 */
            .dt-container > .dt-layout-row:last-child { padding: 8px 14px !important; color: var(--re-text-secondary) !important; font-size: 12px !important; }
            .dt-info { color: var(--re-text-secondary) !important; }
            .dt-paging .dt-paging-button { color: var(--re-text-primary) !important; background: var(--re-bg-elevated) !important; border: 1px solid var(--re-border) !important; border-radius: 4px !important; margin: 0 2px !important; padding: 3px 9px !important; }
            .dt-paging .dt-paging-button.current { background: var(--re-accent-blue) !important; border-color: var(--re-accent-blue) !important; color: #fff !important; }

            /* Cards */
            #re-cards-section { padding: 14px 16px 6px 16px; background-color: var(--re-bg-base); margin-top: 20px; }
            .re-section-header { display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--re-border); }
            .re-section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; color: var(--re-text-secondary); }
            #output-area-3 { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; width: 100%; }
            .re-card-wrapper { background-color: #ffffff; border: 1px solid #d1d5db; border-radius: 6px; display: flex; flex-direction: column; justify-content: space-between; }
            .is-normalized { border-top: 3px solid #16a34a; } .is-updated { border-top: 3px solid var(--re-accent-blue); }
            .re-card-top-bar { display: flex; justify-content: space-between; background-color: #f3f4f6; padding: 5px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; font-weight: 600; color: #374151; }
            .re-card-badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; }
            .badge-new { background-color: #fee2e2; color: #991b1b; } .badge-update { background-color: #dbeafe; color: #1e40af; } .badge-norm { background-color: #dcfce7; color: #166534; }
            pre.info-card { background-color: #ffffff !important; color: #111827 !important; border: none !important; margin: 0 !important; padding: 12px !important; font-family: 'Consolas', 'Courier New', monospace !important; font-size: 12px !important; flex: 1; white-space: pre-wrap !important; }
            .re-card-footer { display: flex; justify-content: flex-end; gap: 6px; padding: 6px 10px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; }
            .copy-button { background-color: var(--re-accent-blue) !important; color: #ffffff !important; border: none !important; border-radius: 4px !important; padding: 5px 12px !important; font-size: 11px !important; font-weight: 600 !important; cursor: pointer; }
            .copy-button.copied { background-color: #16a34a !important; }
            .re-card-secondary-btn { background-color: #e5e7eb; color: #374151; border: none; border-radius: 4px; padding: 5px 9px; font-size: 11px; font-weight: 600; text-transform: uppercase; cursor: pointer; }

            /* Modais */
            .re-modal-overlay { position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.7); display: none; align-items: center; justify-content: center; z-index: 100000; padding: 20px; }
            .re-modal-overlay.open { display: flex; }
            .re-modal-box { background-color: var(--re-bg-surface); color: var(--re-text-primary); border: 1px solid var(--re-border); border-radius: 8px; width: 100%; max-width: 820px; max-height: 88vh; display: flex; flex-direction: column; }
            .re-modal-header { display: flex; justify-content: space-between; padding: 14px 20px; background-color: var(--re-bg-elevated); border-bottom: 1px solid var(--re-border); }
            .re-modal-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: #ffffff; }
            .re-modal-close { background: transparent; border: none; color: var(--re-text-secondary); font-size: 20px; cursor: pointer; }
            .re-modal-body { padding: 18px 20px; overflow-y: auto; font-size: 13px; }
            .re-modal-footer { padding: 12px 20px; background-color: var(--re-bg-elevated); border-top: 1px solid var(--re-border); display: flex; justify-content: flex-end; gap: 10px; }

            .re-details-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin-bottom: 16px; }
            .re-detail-item { background-color: var(--re-bg-base); border: 1px solid var(--re-border); border-radius: 5px; padding: 8px 12px; }
            .re-detail-label { font-size: 11px; color: var(--re-text-secondary); text-transform: uppercase; margin-bottom: 3px; }
            .re-detail-value { font-size: 13px; font-weight: 600; color: #ffffff; word-break: break-word; }
            .re-timeline-list { list-style: none; padding: 0; margin: 0; border-left: 2px solid var(--re-accent-blue); margin-left: 8px; }
            .re-timeline-list li { padding: 6px 0 6px 14px; position: relative; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
            .re-timeline-list li::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background-color: var(--re-accent-blue); position: absolute; left: -5px; top: 11px; }

            .re-form-group { margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
            .re-form-group-col { flex-direction: column; align-items: flex-start; gap: 8px; }
            .re-form-group label { font-size: 13px; font-weight: 600; color: var(--re-text-primary); cursor: pointer;}
            .re-form-input { width: 100%; background-color: var(--re-bg-base); border: 1px solid var(--re-border); color: #ffffff; padding: 8px 10px; border-radius: 5px; font-size: 13px; }

            .re-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
            .re-switch input { opacity: 0; width: 0; height: 0; }
            .re-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--re-bg-base); border: 1px solid var(--re-border); transition: .2s; border-radius: 24px; }
            .re-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: var(--re-text-secondary); transition: .2s; border-radius: 50%; }
            input:checked + .re-slider { background-color: var(--re-accent-blue); border-color: var(--re-accent-blue); }
            input:checked + .re-slider:before { transform: translateX(20px); background-color: #fff; }

            input[type=range].re-range { -webkit-appearance: none; width: 100%; background: transparent; }
            input[type=range].re-range::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: var(--re-accent-blue); cursor: pointer; margin-top: -6px; }
            input[type=range].re-range::-webkit-slider-runnable-track { width: 100%; height: 4px; cursor: pointer; background: var(--re-border); border-radius: 2px; }
        `;
        document.head.appendChild(style);
    }

    /* ==========================================================================
       5. UTILITÁRIOS
       ========================================================================== */
    const DataUtils = {
        parseCompensacao(val) {
            if (val === undefined || val === null || val === '') return 0;
            if (typeof val === 'number') return val;
            let str = String(val).replace(/[^\d.,-]/g, '').trim();
            if (!str) return 0;
            if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
            return parseFloat(str) || 0;
        },
        formatCurrency(val) {
            return (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
        translateStatus(sta) {
            const s = (sta || '').trim().toUpperCase();
            const map = { 'P': 'Pendente', 'D': 'Designado', 'E': 'Em Execução', 'A': 'Acionado' };
            return map[s] || (s || 'Pendente');
        },
        translateGerencia(ger) {
            const map = { 'CE': 'Centro', 'LE': 'Leste', 'MQ': 'Mantiqueira', 'SU': 'Sul', 'NT': 'Norte', 'TR': 'Triângulo' };
            return map[ger] || (ger || 'N/A');
        },
        identifyPoloGroup(polStr) {
            const p = (polStr || '').toUpperCase();
            if (p.includes('SJ') || p.includes('JOÃO') || p.includes('JOAO')) return 'SJ';
            if (p.includes('LF') || p.includes('LAF')) return 'LF';
            return 'OUTRO';
        },
        copyToClipboard(text, btnElement) {
            navigator.clipboard.writeText(text).then(() => {
                const $btn = $(btnElement);
                const originalText = $btn.text();
                $btn.text('COPIADO').addClass('copied').prop('disabled', true);
                setTimeout(() => $btn.text(originalText).removeClass('copied').prop('disabled', false), 1800);
            });
        }
    };

    let globalAggregatedMap = {};
    let globalRawJsonRows = [];
    let isInitialDataLoaded = false;

    /* ==========================================================================
       6. GERENCIADOR DE MODAIS
       ========================================================================== */
    const ModalManager = {
        init() {
            if ($('#re-modal-overlay').length) return;
            const modalHtml = `
                <div id="re-modal-overlay" class="re-modal-overlay">
                    <div class="re-modal-box">
                        <div class="re-modal-header">
                            <h3 id="re-modal-title">Detalhes</h3>
                            <button class="re-modal-close" id="re-modal-close-btn" title="Fechar">&times;</button>
                        </div>
                        <div class="re-modal-body" id="re-modal-body"></div>
                        <div class="re-modal-footer" id="re-modal-footer" style="display:none;"></div>
                    </div>
                </div>
            `;
            $('body').append(modalHtml);
            $('#re-modal-close-btn, #re-modal-overlay').on('click', function(e) {
                if (e.target === this) $('#re-modal-overlay').removeClass('open');
            });
        },
        open(title, contentHtml, footerHtml = '') {
            $('#re-modal-title').text(title);
            $('#re-modal-body').html(contentHtml);
            if (footerHtml) {
                $('#re-modal-footer').html(footerHtml).show();
            } else {
                $('#re-modal-footer').empty().hide();
            }
            $('#re-modal-overlay').addClass('open');
        },

        showServiceDetails(sn) {
            const ad = globalAggregatedMap[sn];
            const history = StorageManager.getDailyHistory().services[sn];
            if (!ad && !history) return;

            const raw = ad && ad.rawRows && ad.rawRows[0] ? ad.rawRows[0] : {};
            const tipS = ad ? ad.tipS : history.tipS;
            const title = `Detalhes da Ocorrência — ${tipS} ${sn}`;

            let clisLabel = ad ? ad.nclSum : 0;
            const initCli = history?.initialClients || history?.currentSnapshot?.nclSum;
            if (initCli && initCli !== clisLabel) {
                clisLabel = `${initCli} &rarr; ${clisLabel}`;
            }

            const compSum = ad ? ad.compSum : 0;
            const statusText = ad ? ad.statusText : 'Normalizado / Fora de Tela';
            const numV = ad ? ad.numV : (history?.currentSnapshot?.numV || 'Nenhuma');
            const pol = ad ? ad.pol : (history?.pol || 'N/A');
            const loc = ad ? ad.loc : (history?.loc || 'N/A');
            const mun = ad ? ad.mun : (history?.mun || 'N/A');
            const nar = ad ? ad.nar : (history?.nar || 'N/A');

            const fields = [
                { label: 'Nº do Serviço', value: `${sn}${raw.tag ? '-' + raw.tag : ''}` },
                { label: 'Tipo de Serviço', value: tipS },
                { label: 'Status Atual', value: statusText },
                { label: 'Equipe / Veículo', value: numV },
                { label: 'Clientes Interrompidos (Total)', value: clisLabel },
                { label: 'Tempo de Pendência (Máx)', value: `${ad ? ad.tpeSum : 0}h` },
                { label: 'CHI Acumulado', value: ad ? ad.chiSum : (history?.currentSnapshot?.chiSum || 0) },
                { label: 'Compensação Financeira', value: `R$ ${DataUtils.formatCurrency(compSum)}` },
                { label: 'Projeção CHI (1H / 3H / 5H)', value: `${raw.projecao_a || 0} / ${raw.projecao_c || 0} / ${raw.projecao_e || 0}` },
                { label: 'Alimentador', value: nar },
                { label: 'Trafo Referência', value: ad ? ad.trafoRef : 'N/A' },
                { label: 'Problemas (ADMS)', value: raw.pbl || 'Não informado' },
                { label: 'Data da Manobra', value: raw.dta ? (window.moment ? window.moment(raw.dta).format('DD/MM/YYYY HH:mm:ss') : raw.dta) : 'N/A' },
                { label: 'Término Previsto', value: raw.ter || 'Não informado' },
                { label: 'Reincidências', value: raw.qre ?? '0' },
                { label: 'Gerência / Regional', value: `${DataUtils.translateGerencia(raw.ger)} / ${raw.reg || 'N/A'}` },
                { label: 'Polo / Subpolo', value: `${raw.pol || pol} / ${raw.sbp || 'N/A'}` },
                { label: 'Município / Cód. Local', value: `${mun} (${loc})` },
                { label: 'Conjunto ANEEL', value: `${raw.cjt || 'N/A'} (Cli: ${raw.qcj || 0} | Lim: ${raw.mcj || 0})` },
                { label: 'Tipo de Mercado / Sede Mun.', value: `${raw.tpm === 'U' ? 'Urbano' : 'Rural'} / Sede: ${raw.sdm == '1' ? 'Sim' : 'Não'}` }
            ];

            let html = `<div class="re-details-grid">`;
            fields.forEach(f => {
                html += `<div class="re-detail-item"><div class="re-detail-label">${f.label}</div><div class="re-detail-value">${f.value}</div></div>`;
            });
            html += `</div>`;

            if (ad && ad.rawRows && ad.rawRows.length > 1) {
                html += `<h4 style="margin: 14px 0 8px 0; font-size: 13px; text-transform: uppercase; color: var(--re-text-secondary);">Trechos / Linhas Agregadas (${ad.rawRows.length} registros)</h4>
                    <table class="table table-bordered" style="background: #18191a; color: #e4e6eb; font-size: 12px; width: 100%;">
                        <thead><tr style="background: #2f3031;"><th>Serviço-Tag</th><th>Clientes</th><th>Tempo</th><th>CHI</th><th>Comp. Financ.</th><th>Trafo Ref.</th></tr></thead>
                        <tbody>${ad.rawRows.map(r => `<tr><td>${r.nmb}-${r.tag || ''}</td><td>${r.ncl || 0}</td><td>${r.tpe || 0}h</td><td>${r.qch || 0}</td><td>R$ ${DataUtils.formatCurrency(DataUtils.parseCompensacao(r.vcv))}</td><td>${r.trr || '-'}</td></tr>`).join('')}</tbody>
                    </table>`;
            }

            if (history && history.timeline && history.timeline.length > 0) {
                html += `<h4 style="margin: 16px 0 8px 0; font-size: 13px; text-transform: uppercase; color: var(--re-text-secondary);">Histórico de Atualizações de Hoje</h4>
                    <ul class="re-timeline-list">${history.timeline.map(t => `<li><strong>${t.time}</strong> — ${t.event}</li>`).join('')}</ul>`;
            }

            const footerHtml = `<button type="button" id="re-btn-copy-modal-info" class="copy-button" style="height: 36px; padding: 0 16px !important;">COPIAR INFORMATIVO DESTA NOTA</button>`;
            this.open(title, html, footerHtml);

            $('#re-btn-copy-modal-info').on('click', function() {
                const cliText = (initCli && initCli !== (ad ? ad.nclSum : 0)) ? `${initCli} → ${ad ? ad.nclSum : 0}` : (ad ? ad.nclSum : 0);
                const infoText = `*❗ INFORMATIVO EMERGENCIAL ❗*\n\n*Polo:* ${pol}\n*Local:* ${loc} - ${mun}\n*Tipo/Numero:* ${tipS} ${sn}\n*Alimentador:* ${nar}\n*Clientes interrompidos:* ${cliText}\n*Compensacao Financeira:* R$ ${DataUtils.formatCurrency(compSum)}\n*Equipe:* ${numV}\n*Situacao:* ${statusText}\n*Observacao:*`;
                DataUtils.copyToClipboard(infoText, this);
            });
        },

        showDailyHistoryModal() {
            const history = StorageManager.getDailyHistory();
            const entries = Object.values(history.services);

            if (entries.length === 0) {
                this.open('Histórico Diário', `<p style="color: var(--re-text-secondary); margin: 0;">Nenhuma ocorrência crítica registrada hoje.</p>`);
                return;
            }

            let html = `<div style="display: flex; flex-direction: column; gap: 12px;">
                ${entries.map(item => `
                    <div style="background: var(--re-bg-base); border: 1px solid var(--re-border); border-radius: 6px; padding: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <strong style="font-size: 14px; color: #fff;">[ ${item.tipS} ${item.sn} ] — ${item.loc} - ${item.mun} (Alim: ${item.nar})</strong>
                            <span class="re-card-badge ${item.state === 'NORMALIZED' ? 'badge-norm' : 'badge-update'}">${item.state === 'NORMALIZED' ? 'NORMALIZADO ÀS ' + (item.normalizedAt || item.lastSeen) : (item.state === 'BELOW_LIMIT' ? 'ABAIXO DO LIMITE' : 'ATIVO EM TELA')}</span>
                        </div>
                        <ul class="re-timeline-list">${item.timeline.map(t => `<li><strong>${t.time}</strong> — ${t.event}</li>`).join('')}</ul>
                    </div>
                `).join('')}
            </div>`;
            this.open(`Histórico do Dia (${entries.length} ocorrências críticas)`, html);
        },

        showSettingsModal() {
            const s = StorageManager.getSettings();
            const html = `
                <div class="re-form-group">
                    <label for="re-cfg-crit-cli">Limite Crítico de Clientes (Faixa Vermelha + Informativo)</label>
                    <input type="number" id="re-cfg-crit-cli" class="re-form-input" value="${s.limits.criticalClients}" style="width: 100px;">
                </div>

                <div class="re-form-group">
                    <label for="re-cfg-en-comp">Habilitar Limite Crítico por Compensação Financeira R$</label>
                    <label class="re-switch"><input type="checkbox" id="re-cfg-en-comp" ${s.enableCompLimit ? 'checked' : ''}><span class="re-slider"></span></label>
                </div>
                <div class="re-form-group" style="${!s.enableCompLimit ? 'opacity:0.5;' : ''}">
                    <label for="re-cfg-crit-comp">Valor do Limite de Compensação (R$)</label>
                    <input type="number" id="re-cfg-crit-comp" class="re-form-input" value="${s.limits.criticalCompensation}" style="width: 100px;">
                </div>

                <div class="re-form-group">
                    <label for="re-cfg-en-med">Habilitar Alerta de Nível Médio (Laranja)</label>
                    <label class="re-switch"><input type="checkbox" id="re-cfg-en-med" ${s.enableMedium ? 'checked' : ''}><span class="re-slider"></span></label>
                </div>
                <div class="re-form-group" style="${!s.enableMedium ? 'opacity:0.5;' : ''}">
                    <label for="re-cfg-med-cli">Limite Médio de Clientes</label>
                    <input type="number" id="re-cfg-med-cli" class="re-form-input" value="${s.limits.mediumClients}" style="width: 100px;">
                </div>

                <div class="re-form-group">
                    <label for="re-cfg-en-low">Habilitar Alerta de Nível Baixo (Amarelo)</label>
                    <label class="re-switch"><input type="checkbox" id="re-cfg-en-low" ${s.enableLow ? 'checked' : ''}><span class="re-slider"></span></label>
                </div>
                <div class="re-form-group" style="${!s.enableLow ? 'opacity:0.5;' : ''}">
                    <label for="re-cfg-low-cli">Limite Baixo de Clientes</label>
                    <input type="number" id="re-cfg-low-cli" class="re-form-input" value="${s.limits.lowClients}" style="width: 100px;">
                </div>

                <div class="re-form-group">
                    <label for="re-cfg-en-sound">Ativar Alarme Sonoro</label>
                    <label class="re-switch"><input type="checkbox" id="re-cfg-en-sound" ${s.enableSound ? 'checked' : ''}><span class="re-slider"></span></label>
                </div>
                <div class="re-form-group re-form-group-col" style="${!s.enableSound ? 'opacity:0.5; pointer-events:none;' : ''}">
                    <label for="re-cfg-vol">Volume do Alarme Sonoro: <span id="vol-val-display">${Math.round(s.alarmVolume * 100)}</span>%</label>
                    <div style="display: flex; gap: 16px; width: 100%; align-items: center;">
                        <input type="range" min="0" max="1" step="0.1" id="re-cfg-vol" class="re-range" value="${s.alarmVolume}">
                        <button type="button" id="re-cfg-test-sound" class="re-btn">Testar Som</button>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                    <button type="button" id="re-cfg-reset" class="re-btn">Restaurar Padrão</button>
                    <button type="button" id="re-cfg-save" class="copy-button" style="height: 38px; padding: 0 18px !important;">Salvar Configurações</button>
                </div>
            `;

            this.open('Configurações Operacionais do Painel', html);

            $('#re-cfg-vol').on('input', function() { $('#vol-val-display').text(Math.round(this.value * 100)); });
            $('#re-cfg-test-sound').on('click', () => {
                AlarmSystem.updateVolume($('#re-cfg-vol').val());
                AlarmSystem.testSound();
            });

            $('#re-cfg-reset').on('click', () => {
                localStorage.removeItem(StorageManager.KEYS.USER_SETTINGS);
                $('#re-modal-overlay').removeClass('open');
                if ($.fn.DataTable) $('#tabela-de-dados-clientes').DataTable().draw(false);
            });

            $('#re-cfg-save').on('click', () => {
                const current = StorageManager.getSettings();
                current.limits.criticalClients = parseInt($('#re-cfg-crit-cli').val(), 10) || 100;
                current.limits.criticalCompensation = parseFloat($('#re-cfg-crit-comp').val()) || 500;
                current.limits.mediumClients = parseInt($('#re-cfg-med-cli').val(), 10) || 50;
                current.limits.lowClients = parseInt($('#re-cfg-low-cli').val(), 10) || 5;

                current.enableSound = $('#re-cfg-en-sound').is(':checked');
                current.enableCompLimit = $('#re-cfg-en-comp').is(':checked');
                current.enableMedium = $('#re-cfg-en-med').is(':checked');
                current.enableLow = $('#re-cfg-en-low').is(':checked');
                current.alarmVolume = Math.max(0, Math.min(1, parseFloat($('#re-cfg-vol').val()) || 1.0));

                StorageManager.saveSettings(current);
                AlarmSystem.updateVolume(current.alarmVolume);
                $('#re-modal-overlay').removeClass('open');
                if ($.fn.DataTable) $('#tabela-de-dados-clientes').DataTable().draw(false);
            });
        }
    };

    /* ==========================================================================
       7. RENDERIZAÇÃO E COMPATIBILIDADE DATATABLES 3
       ========================================================================== */
    function setupNavbarAndContainers(table) {
        const settings = StorageManager.getSettings();
        const $nav = $('nav.navbar');
        const $dtButtons = $('div.dt-buttons');

        // Remove a pesquisa original do DataTables e cria uma customizada, blindada de qualquer atualização de layout da CEMIG
        $('.dt-search, #tabela-de-dados-clientes_filter').hide();
        const $statusContainer = $('div.col-md-3.text-right[style="padding-top: 3px;"]');

        const $filterInput = $('<input type="search" id="Filter" placeholder="Pesquisar painel...">');

        // Dispara o search global do DataTables ao digitar
        $filterInput.on('keyup input change', function() {
            if (table.search() !== this.value) {
                table.search(this.value).draw();
            }
        });

        $dtButtons.find('button').attr('class', 'excel_button');
        $statusContainer.find('div.label').eq(1).attr('id', 'dvAtualizacao');
        const filters = StorageManager.getPoloFilters();

        const $newNavContainer = $(`
            <div id="re-navbar-container">
                <div class="re-nav-left" id="re-nav-left"></div>
                <div class="re-nav-center">
                    <a id="aTitle" href="javascript:void(0)">${settings.panelTitle}</a>
                    <div class="re-status-bar" id="re-status-bar"></div>
                </div>
                <div class="re-nav-right" id="re-nav-right">
                    <div class="re-polo-group" title="Ativar/Desativar alarmes sonoros e visuais por Polo">
                        <button type="button" id="btn-polo-sj" class="polo-btn ${filters.sj ? 'active' : ''}"><span class="led-dot"></span> SJ</button>
                        <button type="button" id="btn-polo-lf" class="polo-btn ${filters.lf ? 'active' : ''}"><span class="led-dot"></span> LF</button>
                    </div>
                    <button type="button" id="re-btn-refresh" class="re-btn" title="Atualizar dados agora"><i class="fa fa-refresh"></i> Atualizar</button>
                    <button type="button" id="re-btn-history" class="re-btn" title="Ver histórico do dia"><i class="fa fa-history"></i> Histórico</button>
                    <button type="button" id="re-btn-settings" class="re-btn" title="Configurações"><i class="fa fa-cog"></i></button>
                </div>
            </div>
        `);

        $newNavContainer.find('#re-nav-left').append($dtButtons);
        $newNavContainer.find('#re-status-bar').append($('#dvStatus'), $('#dvAtualizacao'));
        $newNavContainer.find('#re-nav-right').append($filterInput);
        $nav.empty().append($newNavContainer);

        $newNavContainer.on('click', '.polo-btn', function() {
            $(this).toggleClass('active');
            StorageManager.savePoloFilters($('#btn-polo-sj').hasClass('active'), $('#btn-polo-lf').hasClass('active'));
            table.draw(false);
        });

        $('#re-btn-refresh').on('click', function() {
            const $icon = $(this).find('i');
            $icon.addClass('fa-spin');
            table.ajax.reload(() => setTimeout(() => $icon.removeClass('fa-spin'), 400), false);
        });

        $('#re-btn-history').on('click', () => ModalManager.showDailyHistoryModal());
        $('#re-btn-settings').on('click', () => ModalManager.showSettingsModal());

        if (!$('#re-alerts-wrapper').length) {
            const $alertsWrapper = $(`
                <div id="re-alerts-wrapper">
                    <div id="output-area-1" class="re-alert-section"></div>
                    <div id="output-area-2" class="re-alert-section"></div>
                    <div id="output-area-4" class="re-alert-section"></div>
                    <div id="re-normal-status" class="re-normal-banner" style="display: none;"></div>
                </div>
            `);
            $nav.after($alertsWrapper);

            $alertsWrapper.on('click', '.ack-btn', function() {
                StorageManager.acknowledgeAlarm($(this).attr('data-sn'));
                table.draw(false);
            });
            $alertsWrapper.on('click', '.re-btn-details', function() {
                ModalManager.showServiceDetails($(this).attr('data-sn'));
            });
        }

        if (!$('#re-cards-section').length) {
            const $cardsSection = $(`<div id="re-cards-section"><div class="re-section-header"><span class="re-section-title">Informativos Emergenciais e Atualizações Recentes</span></div><div id="output-area-3"></div></div>`);
            const $tableWrapper = $('#tabela-de-dados-clientes_wrapper, .dt-container, .dataTables_wrapper').first();
            if ($tableWrapper.length) {
                $tableWrapper.parent().after($cardsSection);
            } else {
                $('#tabela-de-dados-clientes').closest('.row').after($cardsSection);
            }
        }
    }

    function applyDynamicColumnConfig(table) {
        const settings = StorageManager.getSettings();
        const visibleMap = {};
        settings.visibleColumns.forEach(col => visibleMap[col.field] = col.title);

        table.columns().every(function(idx) {
            const colField = typeof this.dataSrc === 'function' ? this.dataSrc() : null;
            if (colField && visibleMap[colField]) {
                this.visible(true, false);
                const $th = $(this.header());
                if ($th.find('.dt-column-title').length) {
                    $th.find('.dt-column-title').text(visibleMap[colField]);
                } else {
                    $th.text(visibleMap[colField]);
                }
            } else if (idx < 27) {
                this.visible(false, false);
            }
        });
        table.columns.adjust();
    }

    function createStructuredAlertRow(ad, levelClass, showAckButton) {
        const compFormatado = DataUtils.formatCurrency(ad.compSum);
        const leftControlHtml = showAckButton
            ? `<button type="button" class="ack-btn" data-sn="${ad.nmb}">OK</button>`
            : `<span class="re-ack-status">${levelClass.includes('critical') ? 'VISTO' : (levelClass.includes('medium') ? 'MÉDIO' : 'BAIXO')}</span>`;

        return $(`
            <div class="re-alert-row ${levelClass}">
                <div class="re-alert-left">
                    ${leftControlHtml}
                    <div class="re-alert-id"><span class="re-polo-badge">${ad.poloGroup}</span><span>${ad.tipS} ${ad.nmb}</span></div>
                </div>
                <div class="re-alert-center">
                    <span class="re-metric-pill"><strong>${ad.nclSum}</strong> CLIENTES</span>
                    <span class="re-metric-pill"><strong>${ad.tpeSum}H</strong></span>
                    <span class="re-metric-pill">CHI <strong>${ad.chiSum}</strong></span>
                    <span class="re-metric-pill">R$ <strong>${compFormatado}</strong></span>
                </div>
                <div class="re-alert-right">
                    <div class="re-alert-location" title="${ad.mun} - Alimentador ${ad.nar}">
                        <span>${ad.mun}</span><span class="re-alim">Alim: ${ad.nar}</span>
                    </div>
                    <div class="re-alert-actions">
                        <button type="button" class="re-row-action-btn re-btn-details" data-sn="${ad.nmb}">Detalhes</button>
                    </div>
                </div>
            </div>
        `);
    }

    function createInformativoCard(ad, historyEntry, isNormalizedCard = false) {
        let cardText = '', badgeText = 'EMERGENCIAL', badgeClass = 'badge-new', wrapperExtraClass = '';

        let clisVal = isNormalizedCard ? (historyEntry ? historyEntry.initialClients : 0) : (ad ? ad.nclSum : 0);
        if (!isNormalizedCard && historyEntry && historyEntry.initialClients && historyEntry.initialClients !== ad.nclSum) {
            clisVal = `${historyEntry.initialClients} → ${ad.nclSum}`;
        } else if (isNormalizedCard && historyEntry && historyEntry.initialClients) {
            clisVal = `${historyEntry.initialClients} → 0`;
        }

        if (isNormalizedCard && historyEntry) {
            wrapperExtraClass = 'is-normalized';
            badgeText = `NORMALIZADO ÀS ${historyEntry.normalizedAt || ''}`;
            badgeClass = 'badge-norm';
            cardText = `*✅ INFORMATIVO DE NORMALIZAÇÃO ✅*\n\n*Polo:* ${historyEntry.pol}\n*Local:* ${historyEntry.loc} - ${historyEntry.mun}\n*Tipo/Numero:* ${historyEntry.tipS} ${historyEntry.sn}\n*Alimentador:* ${historyEntry.nar}\n*Clientes interrompidos:* ${clisVal}\n*Situacao:* Normalizado / Encerrado\n*Observacao:*`;
        } else {
            const compFormatado = DataUtils.formatCurrency(ad.compSum);
            if (historyEntry && historyEntry.previousSnapshot) {
                wrapperExtraClass = 'is-updated';
                badgeText = historyEntry.lastChangeBadge || 'ATUALIZADO';
                badgeClass = 'badge-update';
            }
            cardText = `*❗ INFORMATIVO EMERGENCIAL ❗*\n\n*Polo:* ${ad.pol}\n*Local:* ${ad.loc} - ${ad.mun}\n*Tipo/Numero:* ${ad.tipS} ${ad.nmb}\n*Alimentador:* ${ad.nar}\n*Clientes interrompidos:* ${clisVal}\n*Compensacao Financeira:* R$ ${compFormatado}\n*Equipe:* ${ad.numV}\n*Situacao:* ${ad.statusText}\n*Observacao:*`;
        }

        const sn = isNormalizedCard ? historyEntry.sn : ad.nmb;
        const $wrapper = $(`<div class="re-card-wrapper ${wrapperExtraClass}"></div>`);
        const $topBar = $(`<div class="re-card-top-bar"><span>${isNormalizedCard ? historyEntry.tipS + ' ' + sn : ad.tipS + ' ' + sn}</span><span class="re-card-badge ${badgeClass}" title="${badgeText}">${badgeText.length > 28 ? badgeText.substring(0, 28) + '...' : badgeText}</span></div>`);
        const $pre = $('<pre class="info-card"></pre>').text(cardText);
        const $footer = $('<div class="re-card-footer"></div>');

        $footer.append($(`<button type="button" class="re-card-secondary-btn">Detalhes</button>`).on('click', () => ModalManager.showServiceDetails(sn)));
        if (isNormalizedCard) {
            $footer.append($(`<button type="button" class="re-card-secondary-btn">Dispensar</button>`).on('click', () => { StorageManager.dismissNormalizedCard(sn); $wrapper.remove(); }));
        }
        $footer.append($(`<button type="button" class="copy-button">COPIAR</button>`).on('click', function() { DataUtils.copyToClipboard(cardText, this); }));

        $wrapper.append($topBar, $pre, $footer);
        return $wrapper;
    }

    function processTableDraw(table) {
        const allLoadedRows = table.rows().data().toArray();
        if (!allLoadedRows || allLoadedRows.length === 0) return;

        const settings = StorageManager.getSettings();
        const limits = settings.limits;

        const $areaCrit = $('#output-area-1').empty();
        const $areaMed = $('#output-area-2').empty();
        const $areaLow = $('#output-area-4').empty();
        const $areaCards = $('#output-area-3').empty();
        const $normalBanner = $('#re-normal-status').hide();

        const visibleAggregatedMap = {};

        // 1. O que vamos exibir em tela (Baseado no filtro ativo da DataTables)
        table.rows({ search: 'applied' }).every(function() {
            const r = this.data();
            if (!r) return;
            const sn = String(r.nmb || '').trim();
            if (!sn) return;
            const ncl = parseInt(r.ncl, 10) || 0;
            const tpe = parseInt(r.tpe, 10) || 0;
            const chi = (r.tip === 'RC17' || r.tip === 'RC18' || r.tip === 'RC19') ? 0 : (parseInt(r.qch, 10) || 0);
            const comp = (r.tip === 'RC17' || r.tip === 'RC18' || r.tip === 'RC19') ? 0 : DataUtils.parseCompensacao(r.vcv);
            const tipS = (r.tip === '' || r.tag === 'M' || String(r.tip).startsWith('MA')) ? 'MA' : r.tip;

            if (!visibleAggregatedMap[sn]) {
                const polRaw = r.rag || r.pol || 'N/A';
                visibleAggregatedMap[sn] = {
                    nmb: sn, nclSum: ncl, compSum: comp, chiSum: chi, tpeSum: tpe, tipS: tipS,
                    nar: r.nar || 'N/A', status: r.sta || 'P', statusText: DataUtils.translateStatus(r.sta), numV: r.nve || 'Nenhuma',
                    mun: r.nmu || 'N/A', trafoRef: r.trr || 'N/A', pol: polRaw, poloGroup: DataUtils.identifyPoloGroup(polRaw), loc: r.cdl || 'N/A',
                    rawRows: [r]
                };
            } else {
                visibleAggregatedMap[sn].nclSum += ncl;
                visibleAggregatedMap[sn].compSum += comp;
                visibleAggregatedMap[sn].chiSum += chi;
                if (tpe > visibleAggregatedMap[sn].tpeSum) visibleAggregatedMap[sn].tpeSum = tpe;
                visibleAggregatedMap[sn].rawRows.push(r);
            }
        });
        globalAggregatedMap = visibleAggregatedMap;

        // 2. Mapa verdadeiro de SJ e LF (da Real Energy) para o Histórico não dar baixa falsa
        const trueAggregatedMap = {};
        allLoadedRows.forEach(r => {
            if (!r) return;
            const sn = String(r.nmb || '').trim();
            if (!sn) return;

            const polRaw = r.rag || r.pol || 'N/A';
            const poloGroup = DataUtils.identifyPoloGroup(polRaw);

            if (poloGroup !== 'SJ' && poloGroup !== 'LF') return;

            const ncl = parseInt(r.ncl, 10) || 0;
            const tpe = parseInt(r.tpe, 10) || 0;
            const chi = (r.tip === 'RC17' || r.tip === 'RC18' || r.tip === 'RC19') ? 0 : (parseInt(r.qch, 10) || 0);
            const comp = (r.tip === 'RC17' || r.tip === 'RC18' || r.tip === 'RC19') ? 0 : DataUtils.parseCompensacao(r.vcv);

            if (!trueAggregatedMap[sn]) {
                trueAggregatedMap[sn] = {
                    nmb: sn, nclSum: ncl, compSum: comp, chiSum: chi, tpeSum: tpe,
                    tipS: (r.tip === '' || r.tag === 'M' || String(r.tip).startsWith('MA')) ? 'MA' : r.tip,
                    nar: r.nar || 'N/A', statusText: DataUtils.translateStatus(r.sta), numV: r.nve || 'Nenhuma',
                    mun: r.nmu || 'N/A', pol: polRaw, poloGroup: poloGroup, loc: r.cdl || 'N/A'
                };
            } else {
                trueAggregatedMap[sn].nclSum += ncl;
                trueAggregatedMap[sn].compSum += comp;
                trueAggregatedMap[sn].chiSum += chi;
                if (tpe > trueAggregatedMap[sn].tpeSum) trueAggregatedMap[sn].tpeSum = tpe;
            }
        });

        const sortedServices = Object.values(visibleAggregatedMap).sort((a, b) => b.nclSum - a.nclSum);
        const acknowledgedList = StorageManager.getAcknowledgedAlarms();
        const poloFilters = StorageManager.getPoloFilters();

        let shouldPlayAlarm = false;
        let totalAlertsRendered = 0;
        const visibleCriticals = {};

        sortedServices.forEach(ad => {
            const isCritical = ad.nclSum >= limits.criticalClients || (settings.enableCompLimit && ad.compSum >= limits.criticalCompensation);
            const isMedium = settings.enableMedium && !isCritical && ad.nclSum >= limits.mediumClients;
            const isLow = settings.enableLow && !isCritical && !isMedium && ad.nclSum >= limits.lowClients;

            let alarmEnabled = true;
            if (ad.poloGroup === 'SJ' && !poloFilters.sj) alarmEnabled = false;
            if (ad.poloGroup === 'LF' && !poloFilters.lf) alarmEnabled = false;

            if (isCritical) {
                visibleCriticals[ad.nmb] = ad;
                totalAlertsRendered++;
                const isAck = acknowledgedList.includes(ad.nmb);
                if (alarmEnabled && !isAck) {
                    shouldPlayAlarm = true;
                    $areaCrit.append(createStructuredAlertRow(ad, 'level-critical-unack', true));
                } else {
                    $areaCrit.append(createStructuredAlertRow(ad, 'level-critical-ack', false));
                }
            } else if (isMedium) {
                totalAlertsRendered++;
                $areaMed.append(createStructuredAlertRow(ad, 'level-medium', false));
            } else if (isLow) {
                totalAlertsRendered++;
                $areaLow.append(createStructuredAlertRow(ad, 'level-low', false));
            }
        });

        const updatedHistory = StorageManager.syncCriticalServicesHistory(trueAggregatedMap);

        Object.values(visibleCriticals).forEach(ad => {
            const histEntry = updatedHistory.services[ad.nmb];
            $areaCards.append(createInformativoCard(ad, histEntry, false));
        });

        Object.values(updatedHistory.services).forEach(histEntry => {
            if (histEntry.state === 'NORMALIZED' && !histEntry.dismissed) {
                $areaCards.append(createInformativoCard(null, histEntry, true));
            }
        });

        if (totalAlertsRendered === 0) {
            $normalBanner.html(`<span><strong>Operação Normal</strong> — Nenhuma ocorrência acima dos limites configurados.</span><span style="font-size: 12px; opacity: 0.85;">Serviços visíveis: ${sortedServices.length}</span>`).css('display', 'flex');
        }

        if (shouldPlayAlarm) AlarmSystem.trigger();
        else AlarmSystem.stop();

        if (settings.showLocalityCodeInTable) {
            let nmuColIdx = -1;
            table.columns().every(function(idx) {
                if (typeof this.dataSrc === 'function' && this.dataSrc() === 'nmu') nmuColIdx = idx;
            });
            if (nmuColIdx !== -1) {
                table.rows({ search: 'applied' }).every(function() {
                    const rowData = this.data();
                    const cellNode = table.cell(this.index(), nmuColIdx).node();
                    if (cellNode && rowData) $(cellNode).text(rowData.cdl || rowData.nmu || 'N/A');
                });
            }
        }

        window.dispatchEvent(new CustomEvent('RealEnergy:DataProcessed', {
            detail: {
                services: sortedServices,
                rawJsonRows: allLoadedRows
            }
        }));
    }

    function setupSessionAndAutoRefresh(table) {
        const settings = StorageManager.getSettings();
        let tabOpenedForStatus = false;

        setInterval(() => {
            if (!StorageManager.isLoginPageOpen()) {
                table.ajax.reload(null, false);
                $('#spnUltimaAtualizacao').text(new Date(Date.now() + settings.refreshIntervalMs).toLocaleTimeString('pt-BR'));
            }
        }, settings.refreshIntervalMs);

        window.addEventListener('storage', (event) => {
            if (event.key === StorageManager.KEYS.LOGIN_SUCCESS_SIGNAL && event.newValue) {
                $('#dvStatus').hide();
                $('#dvAtualizacao').show();
                tabOpenedForStatus = false;
                table.ajax.reload(null, false);
            }
        });

        const observer = new MutationObserver(() => {
            if ($('#dvStatus').css('display') !== 'none') {
                $('#dvAtualizacao').hide();
                if (!tabOpenedForStatus && !StorageManager.isLoginPageOpen()) {
                    window.open('https://geo.cemig.com.br/painel_de_bordo/Account?autoclose=true', '_blank');
                    tabOpenedForStatus = true;
                }
            } else {
                $('#dvAtualizacao').show();
                tabOpenedForStatus = false;
            }
        });
        if ($('#dvStatus').length) observer.observe($('#dvStatus')[0], { attributes: true, attributeFilter: ['style'] });
    }

    injectStyles();
    $(document).ready(function() {
        AlarmSystem.init();
        ModalManager.init();

        const waitForTable = setInterval(() => {
            if (typeof $ !== 'undefined' && $.fn.DataTable && $('#tabela-de-dados-clientes').length) {
                const table = $('#tabela-de-dados-clientes').DataTable();
                if (table && table.columns) {
                    clearInterval(waitForTable);

                    $('#tabela-de-dados-clientes').on('xhr.dt', function(e, settings, json) {
                        if (json && Array.isArray(json.data)) {
                            globalRawJsonRows = json.data;
                            isInitialDataLoaded = true;
                        }
                    });

                    setupNavbarAndContainers(table);
                    applyDynamicColumnConfig(table);
                    setupSessionAndAutoRefresh(table);

                    // NOVO: Filtro Silencioso de Bastidores (Apenas SJ e LF)
                    $.fn.dataTable.ext.search.push(function(settings, data, dataIndex, rowData) {
                        if (!rowData) return true;
                        const poloGroup = DataUtils.identifyPoloGroup(rowData.rag || rowData.pol || '');
                        return poloGroup === 'SJ' || poloGroup === 'LF';
                    });

                    $('#tabela-de-dados-clientes tbody').on('dblclick', 'tr', function() {
                        const r = table.row(this).data();
                        if (r && r.nmb) ModalManager.showServiceDetails(String(r.nmb).trim());
                    });

                    table.on('draw.dt', () => processTableDraw(table));
                    table.draw();
                }
            }
        }, 150);
    });

})();
