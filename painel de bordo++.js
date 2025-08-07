// ==UserScript==
// @name         Painel de Bordo ++
// @namespace    marco.guedes.e259671
// @version      1.2.2
// @description  Implementa funções ao painel de Bordo Cemig e abre nova guia quando um alerta está ativo.
// @author       Marco Guedes
// @match        *https://geo.cemig.com.br/painel_de_bordo/Geo/Clientes*
// @updateURL    https://raw.githubusercontent.com/SOADGmr/realenergy-tools/main/painel%20de%20bordo%2B%2B.js
// @downloadURL  https://raw.githubusercontent.com/SOADGmr/realenergy-tools/main/painel%20de%20bordo%2B%2B.js
// @grant        window.open
// ==/UserScript==

// TIMER PARA RECARREGAR A PÁGINA
setInterval(function() { location.reload(); }, 120000); // 2 Minutos

$(document).ready(function() {

	// CONFIGURAÇÃO
	var clientLimitUpper = 100; // Limite superior (para informativo e faixa vermelha)
	var clientLimitLower = 50; // Limite inferior (para faixa laranja)
    var filterTerm = "real"; // Filtro
    var tabOpenedForStatus = false; // Flag para controlar a abertura da nova aba

    // CRIAÇÃO DAS ÁREAS:
    var outputArea1, outputArea2, outputArea3;

		// ÁREA 1 (Serviços com 100 clientes ou mais)
		if (!$('#output-area-1').length) {
			outputArea1 = $('<div>').attr('id', 'output-area-1');
			$('nav.navbar').after(outputArea1); // Insere após o navbar
		}

		// ÁREA 2 (Serviços com mais de 50 clientes e menos de 100)
		if (!$('#output-area-2').length) {
			outputArea2 = $('<div>').attr('id', 'output-area-2');
			outputArea1.after(outputArea2); // Insere após a area 1
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
			// Move a div do filtro para dentro da div alvo do logo
			targetDivLogo.append(filterDiv);
		}

		if (logoImg.length) {
			// Remove a imagem do logo
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
            // Remove todo o conteúdo da label, mas mantém o input
            filterLabel.contents().each(function() {
                if (this.nodeType === 3) { // Node.TEXT_NODE
                    $(this).remove();
                }
            });
		}
    }

	// ALTERA TEXTO DE ELEMENTOS
	const headTable = $('th#tabela-titulo-tabela');
	if (headTable.eq(0).length > 0) {headTable.eq(0).text('Serviço');}
	if (headTable.eq(1).length > 0) {headTable.eq(1).text('Tipo');}
	if (headTable.eq(2).length > 0) {headTable.eq(2).text('Alimentador');}
	if (headTable.eq(3).length > 0) {headTable.eq(3).text('Clientes');}
	if (headTable.eq(4).length > 0) {headTable.eq(4).text('Tempo');}
	if (headTable.eq(6).length > 0) {headTable.eq(6).text('Status');}
	if (headTable.eq(7).length > 0) {headTable.eq(7).text('Equipe');}
	if (headTable.eq(11).length > 0) {headTable.eq(11).text('CHI');}
	//if (headTable.eq(8).length > 0) {headTable.eq(8).text('Município');}
	if (headTable.eq(19).length > 0) {headTable.eq(19).text('Referência');}

	// APLICAÇÃO DO FILTRO "real" PARA MOSTRAR SERVIÇOS APENAS DA REAL
    var filterInput = $('#tabela-de-dados-clientes_filter input'); // Onde deve ser aplicado
    if (filterInput.length) {
        try {
            filterInput.val(filterTerm);
            if (filterInput.get(0)) {
                filterInput.get(0).dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                console.warn("Elemento DOM input filtro não encontrado.");
            }
        } catch (e) {
            console.error("Erro ao aplicar filtro 'real':", e);
        }
    } else {
        console.warn("Input filtro DataTables não encontrado.");
    }

    // OCULTANDO COLUNAS INICIAIS INDESEJADAS:
    var table;
    if ($.fn.DataTable && $('#tabela-de-dados-clientes').length) { // Verifica se a Tabela já foi carregada
        table = $('#tabela-de-dados-clientes').DataTable(); // Define table como o objeto Tabela
        if (table) {
            var columnsToHide = [5, 8, 9, 10, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24]; // Colunas a serem ocultas (contagem começa do 0)
            if (columnsToHide.length) {
                try {
                    table.columns(columnsToHide).visible(false); // Oculta as colunas
                } catch (e) {
                    console.error("Erro ao ocultar colunas:", e);
                }
            }
        }
    }

	// MANIPULANDO ATRIBUTOS INLINE:
	const selector1 = 'body > nav > div > div.col-xs-4.text-left';
	$(selector1).removeAttr('style'); // Remove completamente o atributo style
	$(selector1).attr('id', 'NavExcelBtn'); // Adiciona um atributo id com o valor "NavExcelBtn"

	const selector2 = 'body > nav > div > div.col-xs-4.text-center';
	$(selector2).removeAttr('style'); // Remove completamente o atributo style
	$(selector2).attr('id', 'NavTitle'); // Adiciona um atributo id com o valor "NavTitle"

	const selector3 = 'body > nav > div > div.col-xs-4.text-right';
	$(selector3).removeAttr('style'); // Remove completamente o atributo style
	$(selector3).attr('id', 'NavFilter'); // Adiciona um atributo id com o valor "NavFilter"

	const selector4 = '#NavExcelBtn > div > button';
	$(selector4).attr('class', 'excel_button'); // Reatribui os valores de class

	const selector5 = '#NavTitle > div';
	$(selector5).removeAttr('style'); // Remove completamente o atributo style
	$(selector5).attr('id', 'NavAlerts'); // Adiciona um atributo id com o valor "NavAlerts"

	const selector6 = 'body > nav > div';
	$(selector6).attr('id', 'NavRow'); // Adiciona um atributo id com o valor "NavRow"

	const selector7 = '#NavAlerts > div:nth-child(2)';
	$(selector7).attr('id', 'dvAtualizacao'); // Adiciona um atributo id com o valor "dvAtualizacao"
    $(selector7).css('margin-right', '');

	const selector8 = '#dvStatus';
    $(selector8).css('margin-right', '');

	const selector9 = '#tabela-de-dados-clientes_filter > label';
	$(selector9).attr('id', 'Filter'); // Adiciona um atributo id com o valor "Filter"

	const selector10 = '#tabela-de-dados-clientes_filter > label > input[type=search]';
	$(selector10).attr('id', 'Filter'); // Adiciona um atributo id com o valor "Filter"

	const selector11 = '#tabela-de-dados-clientes > thead > tr:nth-child(1)';
	$(selector11).remove();

	const selector12 = '#tabela-de-dados-clientes > tfoot > tr';
    $(selector12).css('background-color', '#424175');

	const selector13 = '#tabela-de-dados-clientes_processing';
    $(selector13).css('display', 'none');

	const selector14 = '#tabela-de-dados-clientes > tfoot > tr > th > input';
	$(selector14).removeAttr('style'); // Remove completamente o atributo style

    // MUDAR NAVALERTS E ABRIR NOVA ABA
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
                        // Se o alerta está ativo e a aba ainda não foi aberta
                        if (!tabOpenedForStatus) {
                            window.open('https://geo.cemig.com.br/painel_de_bordo/', '_blank');
                            tabOpenedForStatus = true; // Marca que a aba foi aberta
                        }
                    } else if (currentDisplay === 'none') {
                        navAlertsDiv.css('display', 'block');
                        tabOpenedForStatus = false; // Reseta a flag quando o alerta não está mais ativo
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
            // Se o alerta está ativo na carga da página e a aba ainda não foi aberta
            if (!tabOpenedForStatus) {
                window.open('https://geo.cemig.com.br/painel_de_bordo/', '_blank');
                tabOpenedForStatus = true; // Marca que a aba foi aberta
            }
        } else if (initialDisplay === 'none') {
             navAlertsDiv.css('display', 'block');
             tabOpenedForStatus = false; // Garante que a flag esteja resetada
        }
	}

	// PREENCHE AS ÁREAS CRIADAS, ATUALIZA COLUNA MUNICÍPIO PARA CÓDIGO DE LOCALIDADE
    if (table) { // Verifica se DataTables foi inicializado

        table.on('draw.dt', function() {
			// Limpa áreas:
            outputArea1.empty();
            outputArea2.empty();
            outputArea3.empty();

            var hasHighInterruptionServicesUpper = false; // Flag area 1 cor
            var hasMediumInterruptionServices = false; // Flag area 2 cor

            var aggregatedData = {}; // Dados agregados

            table.rows({ search: 'applied' }).every(function() { // Itera linhas filtradas
                var rowData = this.data();
                var sn = rowData.nmb || 'N/A'; // Numero de Serviço
                var ncl = parseInt(rowData.ncl, 10) || 0; // Numero de Clientes
                var tpe = parseInt(rowData.tpe, 10) || 0; // Tempo de Pendência

				// Agrega dados:
                if (!aggregatedData[sn]) { // Se não existe dados agregados para esse numero de serviço guarda os dados:
                    aggregatedData[sn] = {
                        nmb: sn, // Numero de Serviço
                        nclSum: ncl, // Numero de Clientes
                        chiSum: 0, // CHI
                        tpeSum: tpe, // Tempo de Pendência
                        tipS: rowData.tip || 'MA', // Tipo de Serviço
                        nar: rowData.nar || 'N/A', // Numero do Alimentador
                        status: rowData.sta || 'Pendente', // Status
                        numV: rowData.nve || 'Nenhuma', // Numero da Equipe
                        mun: rowData.nmu || 'N/A', // Município
                        trafoRef: rowData.trr || 'N/A', // Trafo de Referência
                        pol: rowData.rag || 'N/A', // Polo
                        loc: rowData.cdl || 'N/A' // Localidade
                    };
                } else { // Se já existir esse numero de serviço cadastrado
                    aggregatedData[sn].nclSum += ncl; // Soma clientes
                    if (tpe > aggregatedData[sn].tpeSum) { // Maior tpe
                        aggregatedData[sn].tpeSum = tpe; // Guarda o maior tempo de Pendência
                    }
                }
            });

            // Calcula CHI após agregação
            for (var sn in aggregatedData) {
                if (aggregatedData.hasOwnProperty(sn)) {
                    var ad = aggregatedData[sn];
                    ad.chiSum = ad.nclSum * ad.tpeSum; // CHI = Clientes * Tempo
                }
            }

            // Converte o objeto aggregatedData em um array para poder ordenar
            var aggregatedDataArray = Object.values(aggregatedData);

            // Ordena o array por nclSum em ordem decrescente
            aggregatedDataArray.sort(function(a, b) {
                return b.nclSum - a.nclSum;
            });

            // Popula áreas de saída e verifica flags de cor
            aggregatedDataArray.forEach(function(ad) { // Itera sobre o array ordenado
                var statusText = ad.status; // Formata status
                if (!statusText || statusText.trim() === 'P') statusText = "Pendente";
                else if (statusText.trim() === 'D') statusText = "Designado";
                else if (statusText.trim() === 'E') statusText = "Em Execução";
                else if (statusText.trim() === 'A') statusText = "Acionado";
                else statusText = "Pendente";

                // Cria a string de cada serviço
                var outputString = `O servico ${ad.tipS} ${ad.nmb}, tem ${ad.nclSum} clientes interrompidos ha ${ad.tpeSum}h, resultando em um CHI de ${ad.chiSum} no alimentador (${ad.nar}) de ${ad.mun}.`; // Use ad.mun here

                // Se o serviço contem um numero de clientes acima do limite maior:
                if (ad.nclSum >= clientLimitUpper) {
                    hasHighInterruptionServicesUpper = true; // Define a flag de cor
                    outputArea1.append($('<p>').text(outputString)); // Cria a tag paragrafo com a string

					// Cria o informativo
                    var outputString2 = `*❗ INFORMATIVO EMERGENCIAL ❗*\n\n*Polo:* ${ad.pol}\n*Local:* ${ad.loc}\n*Tipo/Numero:* ${ad.tipS} ${ad.nmb}\n*Alimentador:* ${ad.nar}\n*Clientes interrompidos:* ${ad.nclSum}\n*Equipe:* ${ad.numV}\n*Situacao:* ${statusText}\n*Observacao:*`;

                    // Cria o card do informativo
                    var cardElement = $('<pre>').addClass('info-card').text(outputString2);

                    // Cria o botão de cópia do informativo
                    var copyButton = $('<button>').addClass('copy-button').text('Copiar');

                    // Adiciona o evento de clique ao botão
                    copyButton.on('click', function() {
                        // Copia o informativo do card:
                        var fullCardText = $(this).parent('.info-card').text();
                        var buttonText = $(this).text();
                        var textToCopy = fullCardText.replace(buttonText, '').trim();
						// Simula um CTRL + C a partir da API Clipboard
                        navigator.clipboard.writeText(textToCopy).then(function() {
                            // Feedback visual (opcional)
                            var originalButtonText = $(this).text(); // Guarda o texto original
                            $(this).text('Copiado!').prop('disabled', true);
                            setTimeout(() => {
                                $(this).text(originalButtonText).prop('disabled', false); // Restaura o texto original
                            }, 2000); // Volta ao texto original após 2 segundos
                        }.bind(this)).catch(function(err) {
                            console.error('Erro ao copiar texto: ', err);
                            // Feedback de erro (opcional)
                            var originalButtonText = $(this).text(); // Guarda o texto original
                            $(this).text('Erro!').prop('disabled', true);
                            setTimeout(() => {
                                $(this).text(originalButtonText).prop('disabled', false); // Restaura o texto original
                            }, 2000);
                        }.bind(this));
                    });

                    // Adiciona o botão ao card
                    cardElement.append(copyButton);

                    // Adiciona o card já com o botão à área de saída 3
                    outputArea3.append(cardElement);

                // Se o serviço contem um numero de clientes entre o limite menor e o maior:
                } else if (ad.nclSum >= clientLimitLower && ad.nclSum < clientLimitUpper) {
                    hasMediumInterruptionServices = true; // Define a flag da cor
                    outputArea2.append($('<p>').text(outputString)); // Cria a tag paragrafo com a string
                }
            });

            // Define a cor de fundo das Areas com base na flag
			if (hasHighInterruptionServicesUpper){
				outputArea1.css('background-color', 'red');
				outputArea2.css('background-color', hasMediumInterruptionServices ? 'orange' : '#2e2d61');
			} else {
				if (hasMediumInterruptionServices){
					outputArea1.css('background-color', '#2e2d61');
					outputArea2.css('background-color', 'orange');
				} else {
					outputArea1.css('background-color', 'lime');
					outputArea2.css('background-color', 'lime');
				}
			}

			// Atualiza a columa 9 (Município) e troca seus valores pelos códigos de localidade
            var municipioColumnIndex = 8; // Coluna 9
            table.rows({ search: 'applied' }).nodes().each(function(rowNode, index) {
                var rowData = table.row(rowNode).data();
                // Encontra a célula da coluna município dentro desta linha
                var cell = $(rowNode).find('td').eq(municipioColumnIndex);
                // Atualiza o texto da célula com a propriedade 'mun' dos dados originais da linha
                cell.text(rowData.mun || 'N/A');
            });
        });
    }

    // MODIFICAR O TÍTULO DA PÁGINA E NO NAVBAR
    $('head title').text('Painel de Ocorrências Real'); // Head
    $('#aTitle').text('Painel de Ocorrências Real'); // Navbar

	// MANIPULAÇÃO DO CSS DA PÁGINA:
    var styleElement = document.createElement('style'); // Cria um elemento style
    styleElement.textContent = `
		body {
			margin: 0;
			padding: 0;
			overflow-x: hidden;
			background-color: #2e2d61;
			width: 100vw;
		}
		nav {
			padding: 0;
		}
			.navbar-default {
				background-color: #424175;
				border-style: none;
				height: 100px;
			}
				#NavRow {
					height: 100%;
					}
					#NavExcelBtn {
						padding: 0px;
						height: 100%;
						width: 20%;
					}
						.excel_button {
							background-color: #4c4b7f;
							height: 90px;
							width: 200px;
							margin: 5px;
							font-size: 20pt;
							color: white;
							border-style: none;
						}
						.excel_button:hover {
							background-color: #6b6ba8; /* Cor um pouco mais clara no hover */
							box-shadow: 0 3px 4px 0 rgba(0, 0, 0, 0.14),
										0 3px 3px -2px rgba(0, 0, 0, 0.2),
										0 1px 8px 0 rgba(0, 0, 0, 0.12);
						}
						.excel_button:active {
							box-shadow: 0 4px 5px 0 rgba(0, 0, 0, 0.14),
										0 1px 10px -2px rgba(0, 0, 0, 0.2),
										0 2px 16px 0 rgba(0, 0, 0, 0.12);
							background-color: #7c7cba; /* Cor ainda mais clara ao clicar */
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
								background-color: #4c4b7f;
								font-weight: normal;
								height: 90px;
								width: 200px;
								margin: 5px;
								font-size: 20pt;
								color: white;
								border-style: none;
							}
		#output-area-1 {
			padding: 12px 15px 1px 15px;
			color: white;
			text-align: center;
			font-size: 1.4vw;
			background-color: lime;
   			margin-top: 10px;
		}
		#output-area-2 {
			padding: 12px 15px 1px 15px;
			color: white;
			text-align: center;
			font-size: 1.4vw;
			background-color: lime;
		}
		.dataTables_wrapper {
			background-color: white;
		}
			#tabela-de-dados-clientes {
				DISPLAY: BLOCK;
				width: 100vw !important; /* Força a largura da tabela para 100% */
				min-width: 0; /* Permite que a tabela diminua até 0, se necessário */
				table-layout: fixed; /* Ajuda a manter a largura das colunas */
				margin: 0 !important;
			}
				.table-bordered {
					border: 1px solid #2e2d61;
					border-right-width: 0px;
					border-left-width: 0px;
				}
				#tabela-titulo-tabela {
					background-color: #424175 !important;
					border: 1px solid #2e2d61;
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
					border: 1px solid #2e2d61;
					height: 40px;
					padding: 0 !important;
				}
				.form-control {
					background-color: #4c4b7f;
					border-color: #2e2d61;
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
				position: relative; /* Necessário para posicionar o botão de cópia */
				padding-bottom: 30px; /* Espaço para o botão */
				font-family: courier new;
			}
				#output-area-3 .copy-button { /* Renomeado o ID */
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
					z-index: 10; /* Garante que o botão fique acima do texto */
				}
				#output-area-3 .copy-button:hover { /* Renomeado o ID */
					background-color: #0056b3;
				}
        .col-md-6.text-center {
            display: none !important;
        }
	`;
    document.head.appendChild(styleElement); // Adiciona o elemento style ao head
});
