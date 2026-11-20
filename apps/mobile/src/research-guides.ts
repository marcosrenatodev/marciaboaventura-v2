import type { ResearchCourtId } from "@marcia/contracts";

export type ResearchGuide = {
  steps: readonly string[];
  caution?: string;
  officialGuideUrl?: string;
};

export const researchGuides: Record<ResearchCourtId, ResearchGuide> = {
  TJPR: {
    steps: [
      "Comece pela pesquisa livre com a questão jurídica. Se souber mais dados, use os campos específicos para restringir os resultados.",
      "Abra a decisão na fonte original e confira número, órgão julgador e data antes de salvar a referência.",
    ],
    caution: "A tabela de precedentes qualificados do Projudi depende de perfil; o manual não garante esse acesso para advogados.",
  },
  TJSC: {
    steps: [
      "Use aspas para uma expressão exata; combine ideias com E, OU ou NÃO. PROX busca termos próximos e * amplia variações.",
      "Depois refine por ementa ou inteiro teor, órgão, classe, relator e período. Considere marcar precedentes relevantes e agrupar resultados semelhantes.",
    ],
    officialGuideUrl: "https://eproc1g.tjsc.jus.br/eproc/modulos/jurisprudencia/ajuda/doc/manual_jurisprudencia_tjsc_113.pdf",
  },
  TJRS: {
    steps: [
      "Use a busca livre para explorar e a opção exata para procurar uma expressão específica.",
      "Escolha pesquisa por ementa ou inteiro teor; use número do processo ou OAB se já tiver esses dados.",
    ],
  },
  TRF4: {
    steps: [
      "Escolha a origem da decisão (TRF4, TRU4 ou Turma Recursal) e o tipo de documento; pesquise na ementa ou no inteiro teor.",
      "Os filtros de precedentes relevantes e de agrupamento podem reduzir a lista. Abra a decisão para conferir o contexto completo.",
    ],
    officialGuideUrl: "https://www.trf4.jus.br/trf4/controlador.php?acao=pagina_visualizar&id_pagina=2801",
  },
  STJ: {
    steps: [
      "Refine a pesquisa no SCON e abra a decisão original; confira órgão julgador, relatoria, datas e julgamentos posteriores.",
      "Para temas repetitivos, confira também a situação atual do tema no portal oficial de precedentes qualificados.",
    ],
  },
  STF: {
    steps: [
      "Use as dicas de pesquisa do portal para escolher base, campo e filtros. Abra o espelho e o inteiro teor da decisão.",
      "Para repercussão geral, confira separadamente a tese e a situação do tema no portal oficial.",
    ],
    officialGuideUrl: "https://portal.stf.jus.br/textos/verTexto.asp?pagina=Dicas_de_pesquisa&servico=jurisprudenciaPesquisaGeralNovoPortal",
  },
};
