// ==UserScript==
// @name         Painel de Bordo ++
// @namespace    marco.guedes.e259671
// @version      1.6.2
// @description  Implementa funções ao painel de Bordo Cemig e abre nova guia quando um alerta está ativo. Previne abas de login infinitas.
// @author       Marco Guedes
// @match        *https://geo.cemig.com.br/painel_de_bordo/Geo/Clientes*
// @updateURL    https://raw.githubusercontent.com/SOADGmr/realenergy-tools/main/painel%20de%20bordo%2B%2B.js
// @downloadURL  https://raw.githubusercontent.com/SOADGmr/realenergy-tools/main/painel%20de%20bordo%2B%2B.js
// @grant        window.open
// ==/UserScript==

// Função para verificar se a aba de login está aberta (Heartbeat)
function isLoginPageOpen() {
    var lastSeen = parseInt(localStorage.getItem('cemig_login_last_seen') || '0', 10);
    // Se a aba de login atualizou a variável nos últimos 15 segundos, consideramos ela ativa
    return (Date.now() - lastSeen) < 15000;
}

// === SISTEMA DE ALARME E ARMAZENAMENTO ===
// Som temporário do alarme (substitua a URL abaixo pelo som desejado depois)
const alarmSound = new Audio('https://actions.google.com/sounds/v1/emergency/beeper_emergency_call.ogg');
alarmSound.volume = 1.0;

// Função para pegar alarmes reconhecidos (apaga os antigos se for outro dia)
function getAcknowledgedAlarms() {
    let data = localStorage.getItem('cemig_alarms_ack');
    let today = new Date().toDateString(); // Data de hoje (ex: "Wed Oct 25 2023")
    if (data) {
        try {
            let parsed = JSON.parse(data);
            if (parsed.date === today) {
                return parsed.acknowledged; // Retorna os serviços ignorados de hoje
            }
        } catch(e) {
            console.error("Erro ao ler alarmes salvos", e);
        }
    }
    return []; // Retorna vazio se for de outro dia ou não houver dados
}

// Função para salvar ou remover um alarme reconhecido
function saveAcknowledgedAlarm(sn, isAcknowledged) {
    let acks = getAcknowledgedAlarms();
    let today = new Date().toDateString();

    if (isAcknowledged) {
        if (!acks.includes(sn)) acks.push(sn);
    } else {
        acks = acks.filter(item => item !== sn);
    }

    localStorage.setItem('cemig_alarms_ack', JSON.stringify({ date: today, acknowledged: acks }));
}

// === SISTEMA DE FILTRO DE POLOS (SJ E LF) ===
function loadPoloFilters() {
    let saved = localStorage.getItem('cemig_polo_filters');
    if (saved) {
        try { return JSON.parse(saved); } catch(e) {}
    }
    return { sj: true, lf: true }; // Padrão: ambos marcados (botões ativados)
}

function savePoloFilters(sj, lf) {
    localStorage.setItem('cemig_polo_filters', JSON.stringify({ sj: sj, lf: lf }));
}
// ============================================

// TIMER PARA RECARREGAR A PÁGINA (Com proteção Anti-Loop de Login)
setInterval(function() {
    if (!isLoginPageOpen()) {
        location.reload();
    } else {
        console.log("Painel de Bordo++: Recarregamento automático pausado. A tela de login está aguardando o usuário em outra aba.");
    }
}, 120000); // 2 Minutos

$(document).ready(function() {

    // === SISTEMA DE ALARME VISUAL (TÍTULO PISCANDO) ===
    var originalTitle = 'Painel de Ocorrências Real';
    document.title = originalTitle; // Define o título inicial
    var visualAlarmInterval = null;
    var isVisualAlarmActive = false;

    // Iniciar Alarme Visual
    function startVisualAlarm() {
        if (isVisualAlarmActive) return;
        isVisualAlarmActive = true;
        let showWarning = true;

        visualAlarmInterval = setInterval(function() {
            document.title = showWarning ? "🚨 ALERTA CRÍTICO! 🚨" : originalTitle;
            showWarning = !showWarning;
        }, 1000); // Pisca a cada 1 segundo
    }

    // Parar Alarme Visual
    function stopVisualAlarm() {
        if (!isVisualAlarmActive) return;
        isVisualAlarmActive = false;
        clearInterval(visualAlarmInterval);
        document.title = originalTitle;
    }
    // ====================================================

	// CONFIGURAÇÃO
	var clientLimitUpper = 100; // Limite superior (para informativo e faixa vermelha)
	var clientLimitLower = 50; // Limite inferior (para faixa laranja)
	var clientLimitSmaller = 5; // Limite inferior (para faixa amarela)
    var filterTerm = "real"; // Filtro
    var tabOpenedForStatus = false; // Flag para controlar a abertura da nova aba

    // CRIAÇÃO DAS ÁREAS:
    var outputArea1, outputArea2, outputArea3, outputArea4;

		// ÁREA 1 (Serviços com 100 clientes ou mais)
		if (!$('#output-area-1').length) {
			outputArea1 = $('<div>').attr('id', 'output-area-1');
			$('nav.navbar').after(outputArea1); // Insere após o navbar

            // Adiciona o evento de clique nos BOTOES OK (delegação de evento)
            outputArea1.on('click', '.ack-btn', function() {
                var sn = $(this).attr('data-sn');

                // Marca a ocorrência como vista para removê-la dos alertas
                saveAcknowledgedAlarm(sn, true);

                // Força a tabela a reavaliar os alarmes imediatamente sem recarregar a página inteira
                if ($.fn.DataTable) {
                    $('#tabela-de-dados-clientes').DataTable().draw(false);
                }
            });
		}

		// ÁREA 2 (Serviços com mais de 50 clientes e menos de 100)
		if (!$('#output-area-2').length) {
			outputArea2 = $('<div>').attr('id', 'output-area-2');
			outputArea1.after(outputArea2); // Insere após a area 1
        }

		// ÁREA 4 (Serviços com mais de 5 clientes e menos de 500)
		if (!$('#output-area-4').length) {
			outputArea4 = $('<div>').attr('id', 'output-area-4');
			outputArea2.after(outputArea4); // Insere após a area 2
        }

		// ÁREA 3 (Informativos)
		if (!$('#output-area-3').length) {
			outputArea3 = $('<div>').attr('id', 'output-area-3');
			$('.dataTables_wrapper').after(outputArea3); // Insere depois da tabela
        }

	// MOVIMENTAÇÃO DE ELEMENTOS:
		// Movimentação 1: Input filtro para o lugar do Logo TI
		var filterDiv = $('#tabela-de-dados-clientes_filter');
		var targetDivLogo = $('#dvColTiLogo');
		var logoImg = $('#imgLogoTI');

		if (filterDiv.length && targetDivLogo.length) {
			targetDivLogo.append(filterDiv);
		}
		if (logoImg.length) {
			logoImg.remove();
		}

		// Movimentação 2: Botão Excel para o lugar da Logo Cemig
		var dtButtonsDiv = $('div.dt-buttons');
		var targetDivButtons = $('div.col-xs-4.text-left');
		var elementToRemoveInTargetButtons = targetDivButtons.find('a[href="javascript:void(0)"]');

		if (dtButtonsDiv.length && targetDivButtons.length) {
			if (elementToRemoveInTargetButtons.length) {
				elementToRemoveInTargetButtons.remove();
			}
			targetDivButtons.append(dtButtonsDiv);
		}

		// Movimentação 3: Div de Proxima Atualização para junto do Título
		var sourceDivToMove = $('div.col-md-3.text-right[style="padding-top: 3px;"]');
		var targetDivCenter = $('div.col-xs-4.text-center');
		var titleLink = $('#aTitle');

		if (sourceDivToMove.length && targetDivCenter.length) {
			var elementToRemoveInTargetCenter = targetDivCenter.find('a[href="javascript:void(0)"]');
			 if (elementToRemoveInTargetCenter.length) {
				elementToRemoveInTargetCenter.remove();
			}
			if (titleLink.length) {
				 targetDivCenter.prepend(titleLink);
			}
			targetDivCenter.append(sourceDivToMove);
		}

	// REMOVER O TEXTO PESQUISAR DE FORA E COLOCA DENTRO DO INPUT
    var filterLabel = $('#tabela-de-dados-clientes_filter > label');
    if (filterLabel.length) {
        var filterInput = filterLabel.find('input[type="search"]');
        if (filterInput.length) {
            filterLabel.contents().each(function() {
                if (this.nodeType === 3) { $(this).remove(); }
            });
		}
    }

	// ALTERA TEXTO DE ELEMENTOS
	const headTable = $('th#tabela-titulo-tabela');
	if (headTable.eq(0).length > 0) {headTable.eq(0).text('Serviço');}
	if (headTable.eq(1).length > 0) {headTable.eq(1).text('Tipo');}
	if (headTable.eq(3).length > 0) {headTable.eq(3).text('Alimentador');}
	if (headTable.eq(4).length > 0) {headTable.eq(4).text('Clientes');}
	if (headTable.eq(5).length > 0) {headTable.eq(5).text('Tempo');}
	if (headTable.eq(7).length > 0) {headTable.eq(7).text('Status');}
	if (headTable.eq(8).length > 0) {headTable.eq(8).text('Equipe');}
	if (headTable.eq(12).length > 0) {headTable.eq(12).text('CHI');}
	if (headTable.eq(20).length > 0) {headTable.eq(21).text('Referência');}

	// APLICAÇÃO DO FILTRO "real" PARA MOSTRAR SERVIÇOS APENAS DA REAL
    var filterInput2 = $('#tabela-de-dados-clientes_filter input'); // Onde deve ser aplicado
    if (filterInput2.length) {
        try {
            filterInput2.val(filterTerm);
            if (filterInput2.get(0)) {
                filterInput2.get(0).dispatchEvent(new Event('input', { bubbles: true }));
            }
        } catch (e) {
            console.error("Erro ao aplicar filtro 'real':", e);
        }
    }

    // OCULTANDO COLUNAS INICIAIS INDESEJADAS:
    var table;
    if ($.fn.DataTable && $('#tabela-de-dados-clientes').length) {
        table = $('#tabela-de-dados-clientes').DataTable();
        if (table) {
            var columnsToHide = [2,6,9,10,11,13,14,15,16,17,19,20,22,23,24,25,26];
            if (columnsToHide.length) {
                try {
                    table.columns(columnsToHide).visible(false);
                } catch (e) {}
            }
        }
    }

	// MANIPULANDO ATRIBUTOS INLINE:
	const selector1 = 'body > nav > div > div.col-xs-4.text-left';
	$(selector1).removeAttr('style').attr('id', 'NavExcelBtn');

	const selector2 = 'body > nav > div > div.col-xs-4.text-center';
	$(selector2).removeAttr('style').attr('id', 'NavTitle');

	const selector3 = 'body > nav > div > div.col-xs-4.text-right';
	$(selector3).removeAttr('style').attr('id', 'NavFilter');

	$('#NavExcelBtn > div > button').attr('class', 'excel_button');
	$('#NavTitle > div').removeAttr('style').attr('id', 'NavAlerts');
	$('body > nav > div').attr('id', 'NavRow');

    // INJETA OS BOTÕES ESTILIZADOS DE POLO NO NAVROW
    if (!$('#polo-filter-container').length) {
        let filters = loadPoloFilters();

        let poloDiv = $('<div>').attr('id', 'polo-filter-container');

        let btnSj = $('<button>')
            .attr('id', 'btn-polo-sj')
            .attr('title', 'Ativar alarmes sonoros/visuais para São João')
            .text('SJ')
            .addClass('polo-btn ' + (filters.sj ? 'active' : ''));

        let btnLf = $('<button>')
            .attr('id', 'btn-polo-lf')
            .attr('title', 'Ativar alarmes sonoros/visuais para Lafaiete')
            .text('LF')
            .addClass('polo-btn ' + (filters.lf ? 'active' : ''));

        poloDiv.append(btnSj, btnLf);
        $('#NavRow').append(poloDiv);

        // Ação de clique para os botões de Polo (Toggle)
        $('#NavRow').on('click', '.polo-btn', function() {
            // Alterna a classe 'active' para criar o efeito visual de Ligar/Desligar
            $(this).toggleClass('active');

            let sj = $('#btn-polo-sj').hasClass('active');
            let lf = $('#btn-polo-lf').hasClass('active');
            savePoloFilters(sj, lf);

            // Força a tabela a reavaliar os alarmes imediatamente sem recarregar a página
            if ($.fn.DataTable) {
                $('#tabela-de-dados-clientes').DataTable().draw(false);
            }
        });
    }

	$('#NavAlerts > div:nth-child(2)').attr('id', 'dvAtualizacao').css('margin-right', '');
    $('#dvStatus').css('margin-right', '');
	$('#tabela-de-dados-clientes_filter > label').attr('id', 'Filter');
	$('#tabela-de-dados-clientes_filter > label > input[type=search]').attr('id', 'Filter');
	$('#tabela-de-dados-clientes > thead > tr:nth-child(1)').remove();
	$('#tabela-de-dados-clientes > tfoot > tr').css('background-color', '#404040');
	$('#tabela-de-dados-clientes_processing').css('display', 'none');
	$('#tabela-de-dados-clientes > tfoot > tr > th > input').removeAttr('style');

    // MUDAR NAVALERTS E ABRIR NOVA ABA (Com proteção Anti-Loop)
    var dvStatus = $('#dvStatus');
    var navAlertsDiv = $('#dvAtualizacao');

    if (dvStatus.length && navAlertsDiv.length) {
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    var currentDisplay = $(mutation.target).css('display');
                    if (currentDisplay === 'inline') {
                        $(mutation.target).css('display', 'block');
                        navAlertsDiv.css('display', 'none');
                        if (!tabOpenedForStatus) {
                            if (!isLoginPageOpen()) {
                                window.open('https://geo.cemig.com.br/painel_de_bordo/Account?autoclose=true', '_blank');
                                tabOpenedForStatus = true;
                            } else {
                                console.log("Painel de Bordo++: Abertura de aba pausada. Tela de login aguardando usuário.");
                            }
                        }
                    } else if (currentDisplay === 'none') {
                        navAlertsDiv.css('display', 'block');
                        tabOpenedForStatus = false;
                    }
                }
            });
        });
        var observerConfig = { attributes: true, attributeFilter: ['style'] };

        observer.observe(dvStatus[0], observerConfig);
        var initialDisplay = dvStatus.css('display');
         if (initialDisplay === 'inline') {
            dvStatus.css('display', 'block');
            navAlertsDiv.css('display', 'none');
            if (!tabOpenedForStatus) {
                if (!isLoginPageOpen()) {
                    window.open('https://geo.cemig.com.br/painel_de_bordo/Account?autoclose=true', '_blank');
                    tabOpenedForStatus = true;
                }
            }
        } else if (initialDisplay === 'none') {
             navAlertsDiv.css('display', 'block');
             tabOpenedForStatus = false;
        }
	}

	// PREENCHE AS ÁREAS CRIADAS, ATUALIZA COLUNA MUNICÍPIO PARA CÓDIGO DE LOCALIDADE
    if (table) {

        table.on('draw.dt', function() {
			// Limpa áreas:
            outputArea1.empty();
            outputArea2.empty();
            outputArea4.empty();
            outputArea3.empty();

            var hasHighInterruptionServicesUpper = false;
            var hasMediumInterruptionServices = false;
            var hasLowerInterruptionServices = false;

            var aggregatedData = {};
            var acknowledgedList = getAcknowledgedAlarms(); // Busca a lista de ignorados de hoje
            var shouldPlayAlarm = false; // Flag para tocar o alarme nesta recarga

            // Lê o estado atual dos filtros de polo (baseado na classe dos botões)
            var poloFilters = loadPoloFilters();
            var isSjSelected = poloFilters.sj;
            var isLfSelected = poloFilters.lf;

            table.rows({ search: 'applied' }).every(function() {
                var rowData = this.data();
                var sn = rowData.nmb || 'N/A';
                var ncl = parseInt(rowData.ncl, 10) || 0;
                var tpe = parseInt(rowData.tpe, 10) || 0;

				// Agrega dados:
                if (!aggregatedData[sn]) {
                    aggregatedData[sn] = {
                        nmb: sn, nclSum: ncl, chiSum: 0, tpeSum: tpe,
                        tipS: rowData.tip || 'MA', nar: rowData.nar || 'N/A',
                        status: rowData.sta || 'Pendente', numV: rowData.nve || 'Nenhuma',
                        mun: rowData.nmu || 'N/A', trafoRef: rowData.trr || 'N/A',
                        pol: rowData.rag || 'N/A', loc: rowData.cdl || 'N/A'
                    };
                } else {
                    aggregatedData[sn].nclSum += ncl;
                    if (tpe > aggregatedData[sn].tpeSum) {
                        aggregatedData[sn].tpeSum = tpe;
                    }
                }
            });

            // Calcula CHI após agregação
            for (var sn in aggregatedData) {
                if (aggregatedData.hasOwnProperty(sn)) {
                    var ad = aggregatedData[sn];
                    ad.chiSum = ad.nclSum * ad.tpeSum;
                }
            }

            var aggregatedDataArray = Object.values(aggregatedData);
            aggregatedDataArray.sort(function(a, b) {
                return b.nclSum - a.nclSum;
            });

            // Popula áreas de saída e verifica flags de cor
            aggregatedDataArray.forEach(function(ad) {
                var statusText = ad.status;
                if (!statusText || statusText.trim() === 'P') statusText = "Pendente";
                else if (statusText.trim() === 'D') statusText = "Designado";
                else if (statusText.trim() === 'E') statusText = "Em Execução";
                else if (statusText.trim() === 'A') statusText = "Acionado";
                else statusText = "Pendente";

                var outputString = `O servico ${ad.tipS} ${ad.nmb}, tem ${ad.nclSum} clientes interrompidos ha ${ad.tpeSum}h, resultando em um CHI de ${ad.chiSum} no alimentador (${ad.nar}) de ${ad.mun}.`;

                // LÓGICA DE FILTRO DE POLO
                let polString = ad.pol.toUpperCase();
                let isSJ = polString.includes('SJ') || polString.includes('JOÃO') || polString.includes('JOAO');
                let isLF = polString.includes('LF') || polString.includes('LAF');

                let isAlarmEnabled = true;

                // Bloqueia a ação se o polo estiver desativado no botão do topo
                if (isSJ && !isSjSelected) isAlarmEnabled = false;
                if (isLF && !isLfSelected) isAlarmEnabled = false;

                // Limite Vermelho (Crítico)
                if (ad.nclSum >= clientLimitUpper) {
                    hasHighInterruptionServicesUpper = true;

                    var isAck = acknowledgedList.includes(ad.nmb);

                    // Se o alarme estiver habilitado pelo Polo e AINDA NÃO foi reconhecido (visto)
                    if (isAlarmEnabled && !isAck) {
                        shouldPlayAlarm = true; // Aciona o gatilho para tocar o som/sirene!

                        // Layout Flexbox moderno com o Botão 'OK' esquerdo que some ao ser clicado
                        var pElement = $('<div>').css({
                            display: 'flex',
                            alignItems: 'stretch', // Faz o botão e o texto terem a mesma altura da linha
                            borderBottom: '1px solid rgba(0,0,0,0.2)' // Linha sutil separando os alertas
                        });

                        var btnElement = $('<button>').attr({
                            class: 'ack-btn',
                            'data-sn': ad.nmb,
                            title: 'Marcar como visto para silenciar o alarme desta ocorrência'
                        }).text('OK');

                        var textSpan = $('<span>').css({
                            flex: 1, // Faz o texto ocupar o resto do espaço
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '12px 15px',
                            textAlign: 'center'
                        }).text(outputString);

                        pElement.append(btnElement).append(textSpan);
                        outputArea1.append(pElement);
                    } else {
                        // Polo desativado OU ocorrência JÁ vista e clicada (isAck == true)
                        // Mostra apenas o texto simples, tornando a linha uma "faixa normal" sem o botão
                        var simpleP = $('<div>').css({
                            padding: '12px 15px',
                            textAlign: 'center',
                            borderBottom: '1px solid rgba(0,0,0,0.2)'
                        }).text(outputString);
                        outputArea1.append(simpleP);
                    }

					// Cria o informativo
                    var outputString2 = `*❗ INFORMATIVO EMERGENCIAL ❗*\n\n*Polo:* ${ad.pol}\n*Local:* ${ad.loc} - ${ad.mun}\n*Tipo/Numero:* ${ad.tipS} ${ad.nmb}\n*Alimentador:* ${ad.nar}\n*Clientes interrompidos:* ${ad.nclSum}\n*Equipe:* ${ad.numV}\n*Situacao:* ${statusText}\n*Observacao:*`;
                    var cardElement = $('<pre>').addClass('info-card').text(outputString2);
                    var copyButton = $('<button>').addClass('copy-button').text('Copiar');

                    copyButton.on('click', function() {
                        var fullCardText = $(this).parent('.info-card').text();
                        var buttonText = $(this).text();
                        var textToCopy = fullCardText.replace(buttonText, '').trim();
                        navigator.clipboard.writeText(textToCopy).then(function() {
                            var originalButtonText = $(this).text();
                            $(this).text('Copiado!').prop('disabled', true);
                            setTimeout(() => { $(this).text(originalButtonText).prop('disabled', false); }, 2000);
                        }.bind(this)).catch(function(err) {
                            console.error('Erro ao copiar texto: ', err);
                            var originalButtonText = $(this).text();
                            $(this).text('Erro!').prop('disabled', true);
                            setTimeout(() => { $(this).text(originalButtonText).prop('disabled', false); }, 2000);
                        }.bind(this));
                    });

                    cardElement.append(copyButton);
                    outputArea3.append(cardElement);

                // Limite Laranja
                } else if (ad.nclSum >= clientLimitLower && ad.nclSum < clientLimitUpper) {
                    hasMediumInterruptionServices = true;
                    outputArea2.append($('<p>').css({ textAlign: 'center', margin: '5px 0' }).text(outputString));
                // Limite Amarelo
                } else if (ad.nclSum >= clientLimitSmaller && ad.nclSum < clientLimitLower) {
                    hasLowerInterruptionServices = true;
                    outputArea4.append($('<p>').css({ textAlign: 'center', margin: '5px 0' }).text(outputString));
                }
            });

            // Dispara ou Para o sistema sonoro/visual
            if (shouldPlayAlarm) {
                startVisualAlarm();
                alarmSound.play().catch(function(error) {
                    console.warn("Alarme bloqueado pelo navegador. Interaja com a página uma vez para habilitar o som automático.", error);
                });
            } else {
                stopVisualAlarm();
            }

            // Define a cor de fundo das Areas com base na flag
			if (hasHighInterruptionServicesUpper){
				outputArea1.css('background-color', 'red');
				outputArea2.css('background-color', hasMediumInterruptionServices ? 'orange' : '#2e2e2e');
				outputArea4.css('background-color', hasLowerInterruptionServices ? 'yellow' : '#2e2e2e');
			} else {
				if (hasMediumInterruptionServices){
					outputArea1.css('background-color', '#2e2e2e');
					outputArea2.css('background-color', 'orange');
                    outputArea4.css('background-color', hasLowerInterruptionServices ? 'yellow' : '#2e2e2e');
				} else {
                    if (hasLowerInterruptionServices) {
					outputArea1.css('background-color', '#2e2e2e');
					outputArea2.css('background-color', '#2e2e2e');
                    outputArea4.css('background-color', 'yellow' );
                    } else {
                        outputArea1.css('background-color', 'lime');
                        outputArea2.css('background-color', 'lime');
                    }
				}
			}

			// Atualiza a columa 9 (Município) e troca seus valores pelos códigos de localidade
            var municipioColumnIndex = 8;
            table.rows({ search: 'applied' }).nodes().each(function(rowNode, index) {
                var rowData = table.row(rowNode).data();
                var cell = $(rowNode).find('td').eq(municipioColumnIndex);
                cell.text(rowData.mun || 'N/A');
            });
        });
    }

    // MODIFICAR O TÍTULO NO NAVBAR
    $('#aTitle').text('Painel de Ocorrências Real');

	// MANIPULAÇÃO DO CSS DA PÁGINA:
    var styleElement = document.createElement('style');
    styleElement.textContent = `
		body {
			margin: 0;
			padding: 0;
			overflow-x: hidden;
			background-color: #2e2e2e;
			width: 100vw;
		}
		nav {
			padding: 0;
		}
			.navbar-default {
				background-color: #404040;
				border-style: none;
				height: 100px;
			}
				#NavRow {
					height: 100%;
                    position: relative; /* Necessário para alinhar os novos botoes */
				}
                #polo-filter-container {
                    position: absolute;
                    top: 5px;
                    right: 21%; /* Fica posicionado perfeitamente entre os titulos e o campo de pesquisa */
                    display: flex;
                    gap: 5px;
                    height: 90px;
                }
                .polo-btn {
                    background-color: #262626; /* Mesma cor base do btn Excel */
                    color: white;
                    border: none;
                    width: 70px;
                    font-size: 16pt;
                    cursor: pointer;
                    margin: 0;
                    transition: all 0.2s ease;
                }
                .polo-btn:hover {
                    background-color: #2E2E2E;
                }
                .polo-btn.active {
                    background-color: #151515; /* Mais escuro quando ligado */
                    box-shadow: inset 0px 4px 6px rgba(0, 0, 0, 0.6); /* Efeito de botão pressionado */
                    color: #fff;
                }
					#NavExcelBtn {
						padding: 0px;
						height: 100%;
						width: 20%;
					}
						.excel_button {
							background-color: #262626;
							height: 90px;
							width: 200px;
							margin: 5px;
							font-size: 20pt;
							color: white;
							border-style: none;
						}
						.excel_button:hover {
							background-color: #2E2E2E;
							box-shadow: 0 3px 4px 0 rgba(0, 0, 0, 0.14),
										0 3px 3px -2px rgba(0, 0, 0, 0.2),
										0 1px 8px 0 rgba(0, 0, 0, 0.12);
						}
						.excel_button:active {
							box-shadow: 0 4px 5px 0 rgba(0, 0, 0, 0.14),
										0 1px 10px -2px rgba(0, 0, 0, 0.2),
										0 2px 16px 0 rgba(0, 0, 0, 0.12);
							background-color: #303030;
						}
					#NavTitle {
						display: flex;
						flex-direction: column;
						align-items: center;
						justify-content: center;
						padding: 0px;
						height: 100%;
						width: 60%;
					}
						#aTitle {
							display: table-cell;
							vertical-align: bottom;
							text-align: center;
							width: 100%;
							height: 50%;
							padding: 0px;
							padding-top: 10px;
						}
						.text-title, .text-title:link, .text-title:visited, .text-title:hover, .text-title:active {
							font-weight: normal;
							text-transform: uppercase;
							color: #fff;
							text-align: center;
						}
						#NavAlerts{
							text-align: center;
							width: 100%;
							height: 50%;
						}
							#dvAtualizacao, #dvStatus {
								font-size: 15pt;
								padding: 10px;
								margin: auto;
								width: 50%;
								height: 40px;
							}
					#NavFilter {
						padding: 0px;
						height: 100%;
						width: 20%;
					}
						div.dataTables_filter {
							width: 100%;
							height: 100%;
						}
							input#Filter {
								padding: 20px;
								background-color: #262626;
								font-weight: normal;
								height: 90px;
								width: 200px;
								margin: 5px;
								font-size: 20pt;
								color: white;
								border-style: none;
							}
		#output-area-1 {
            /* Padding removido para permitir que os novos botões OK encostem na margem */
			color: white;
			font-size: 1.4vw;
			background-color: lime;
   			margin-top: 10px;
		}
            /* Novo botão quadrado de reconhecimento da ocorrência */
            .ack-btn {
                background-color: #990000; /* Cores do cliente mantidas */
                color: white;
                border: none;
                width: 80px; /* Largura fixa para manter todos quadrados/simétricos */
                font-weight: bold;
                font-size: 16pt;
                cursor: pointer;
                transition: all 0.2s ease;
                flex-shrink: 0; /* Garante que o botão não amasse com textos grandes */
            }
            .ack-btn:hover {
                background-color: #550000;
            }
		#output-area-2 {
			padding: 12px 15px 10px 15px;
			color: white;
			font-size: 1.4vw;
			background-color: lime;
		}
		#output-area-4 {
			padding: 12px 15px 10px 15px;
			color: #2e2e2e;
			font-size: 1.4vw;
			background-color: lime;
		}
		.dataTables_wrapper {
			background-color: white;
		}
			#tabela-de-dados-clientes {
				DISPLAY: BLOCK;
				width: 100vw !important;
				min-width: 0;
				table-layout: fixed;
				margin: 0 !important;
			}
				.table-bordered {
					border: 1px solid #2e2e2e;
					border-right-width: 0px;
					border-left-width: 0px;
				}
				#tabela-titulo-tabela {
					background-color: #404040 !important;
					border: 1px solid #2e2e2e;
					height: 50px;
					vertical-align: middle;
					font-size: 1.3vw;
					text-transform: uppercase;
				}
				table.dataTable thead .sorting:after {
					display: none;
				}
				#tabela-de-dados-clientes tbody {
					font-size: 1.3vw;
				}
				.table>tfoot>tr>th, .table-bordered>tfoot>tr>td {
					border: 1px solid #2e2e2e;
					height: 40px;
					padding: 0 !important;
				}
				.form-control {
					background-color: #262626;
					border-color: #2e2e2e;
					border-radius: 0;
					padding-left: 15px;
					color: white;
					height: 100%;
				}
		#output-area-3 {
			margin-top: -9px;
			padding: 10px;
			border: 1px solid #ccc;
			background-color: #f9f9f9;
			display: flex;
			flex-wrap: wrap;
			gap: 10px;
			width: 100%;
		}
 			pre {
	 			font-size: 12px;
			}
			#output-area-3 pre.info-card {
				width: calc(20% - 8px) !important;
				box-sizing: border-box;
				padding: 10px;
				border: 1px solid #ddd;
				background-color: #fff;
				margin: 0;
				white-space: pre-wrap;
				word-wrap: break-word;
				position: relative;
				padding-bottom: 30px;
				font-family: courier new;
			}
				#output-area-3 .copy-button {
					position: absolute;
					bottom: 5px;
					right: 5px;
					padding: 2px 5px;
					font-size: 0.8em;
					cursor: pointer;
					background-color: #007bff;
					color: white;
					border: none;
					border-radius: 3px;
					z-index: 10;
				}
				#output-area-3 .copy-button:hover {
					background-color: #0056b3;
				}
        .col-md-6.text-center {
            display: none !important;
        }
	`;
    document.head.appendChild(styleElement);
});
