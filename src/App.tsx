import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import {
  Barcode,
  Box,
  Download,
  FileUp,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { parseBoolean, parseCsvRows } from "./csv";
type Variant = { a: string; b: string; barcode: string; stock: string };
type Product = {
  _id: string;
  nome: string;
  preco_venda: string;
  variants: Variant[];
  enviar_dados_balanca: boolean;
  [key: string]: string | boolean | Variant[];
};
type Tab = "produto" | "precos" | "organizacao" | "grades" | "fiscal";
type ValidationIssue = { tab: Tab; message: string };
const headers = [
  "codigo_produto",
  "nome",
  "codigo_de_barras",
  "sigla_da_unidade_de_medida",
  "marca_do_produto",
  "categoria",
  "subcategoria_nivel_1",
  "subcategoria_nivel_2",
  "preco_custo",
  "preco_fornecedor",
  "preco_minimo_de_venda",
  "preco_venda",
  "peso",
  "estoque",
  "estoque_minimo",
  "origem_produto",
  "receita_do_produto",
  "referencia_interna",
  "enviar_dados_balanca",
  "informacao_adicional",
  "cnpj_fornecedor",
  "nome_do_fornecedor",
  "multiplicador",
  "sigla_pacote",
  "grade_1",
  "grade_2",
  "opcao_de_grade_1",
  "opcao_de_grade_2",
  "ncm",
  "cest",
  "aliquota_cofins",
  "aliquota_ipi",
  "aliquota_pis",
  "enquadramento_de_ipi",
  "codigo_situacao_tributaria_ipi",
  "codigo_situacao_tributaria_pis",
  "codigo_situacao_tributaria_icms",
  "aliquota_icms",
  "mva",
  "reducao_na_base_de_calculo",
  "origem_icms",
  "destino_icms",
  "csosn",
  "codigo_beneficio_fiscal_regra_icms",
  "codigo_beneficio_fiscal_produto",
  "valor_base_calculo_icms_st_retido_anteriormente",
  "valor_icms_st_retido_anteriormente",
];
const names = [...headers];
const blank = (): Product =>
  Object.assign(Object.fromEntries(names.map((k) => [k, ""])), {
    _id: crypto.randomUUID(),
    nome: "",
    preco_venda: "",
    sigla_da_unidade_de_medida: "UN",
    ncm: "00000000",
    origem_produto: "0",
    variants: [],
    enviar_dados_balanca: false,
  }) as Product;
const csv = (v: unknown) => {
  const s = String(v ?? "");
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const PRICE_FIELDS = [
  "preco_venda",
  "preco_minimo_de_venda",
  "preco_custo",
  "preco_fornecedor",
] as const;
const isPriceField = (name: string) =>
  PRICE_FIELDS.includes(name as (typeof PRICE_FIELDS)[number]);
const parsePrice = (value: unknown) => {
  let text = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/^R\$/i, "");
  if (!text || !/^-?[\d.,]+$/.test(text)) return undefined;
  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  const separator = Math.max(comma, dot);
  const integer = (separator >= 0 ? text.slice(0, separator) : text).replace(
    /\D/g,
    "",
  );
  const fraction =
    separator >= 0 ? text.slice(separator + 1).replace(/\D/g, "") : "";
  if (!integer && !fraction) return undefined;
  const number = Number(
    `${negative ? "-" : ""}${integer || "0"}${fraction ? `.${fraction}` : ""}`,
  );
  return Number.isFinite(number) ? number : undefined;
};
const priceInput = (value: string) => {
  const text = value.replace(/[^\d.,]/g, "");
  if (!text) return "";
  const separator = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
  if (separator < 0) return text.replace(/\D/g, "");
  const integer = text.slice(0, separator).replace(/\D/g, "") || "0";
  const fraction = text
    .slice(separator + 1)
    .replace(/\D/g, "")
    .slice(0, 2);
  return `${integer},${fraction}`;
};
const priceForInput = (value: unknown) => {
  if (String(value ?? "").trim() === "") return "";
  const number = parsePrice(value);
  return number === undefined
    ? String(value)
    : number.toFixed(2).replace(".", ",");
};
const priceForHiper = (value: unknown) => {
  if (String(value ?? "").trim() === "") return "";
  const number = parsePrice(value);
  return number === undefined ? "" : number.toFixed(2);
};
const normalizeProductPrices = (product: Product) => {
  const normalized = { ...product };
  PRICE_FIELDS.forEach((field) => {
    normalized[field] = priceForInput(product[field]);
  });
  return normalized;
};
const brl = (v: string) =>
  (parsePrice(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const MAX_PRODUCT_CODE = 2147483647;
const PRODUCT_CODE_SEQUENCE_START = 1000000000;
const PRODUCT_CODE_SEQUENCE_KEY = "hiper-next-product-code";
const productBarcodes = (item: Product) =>
  [String(item.codigo_de_barras || ""), ...item.variants.map((v) => v.barcode)]
    .map((code) => code.trim())
    .filter(Boolean);
const duplicateBarcodesOf = (items: Product[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  items.flatMap(productBarcodes).forEach((code) => {
    if (seen.has(code)) duplicates.add(code);
    seen.add(code);
  });
  return duplicates;
};
const hasDuplicateBarcode = (items: Product[]) =>
  duplicateBarcodesOf(items).size > 0;
const duplicateProductCodesOf = (items: Product[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  items.forEach((item) => {
    const code = String(item.codigo_produto || "").trim();
    if (!code) return;
    if (seen.has(code)) duplicates.add(code);
    seen.add(code);
  });
  return duplicates;
};
const hasDuplicateProductCode = (items: Product[]) =>
  duplicateProductCodesOf(items).size > 0;
const validStock = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return true;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) && number >= 0;
};
const syncProductCodeSequence = (items: Product[]) => {
  const highestUsed = items.reduce((highest, item) => {
    const code = Number(String(item.codigo_produto || "").trim());
    return Number.isInteger(code) && code >= PRODUCT_CODE_SEQUENCE_START
      ? Math.max(highest, code)
      : highest;
  }, PRODUCT_CODE_SEQUENCE_START - 1);
  const stored = Number(localStorage.getItem(PRODUCT_CODE_SEQUENCE_KEY));
  const next = Math.max(
    PRODUCT_CODE_SEQUENCE_START,
    Number.isInteger(stored) ? stored : PRODUCT_CODE_SEQUENCE_START,
    highestUsed + 1,
  );
  localStorage.setItem(
    PRODUCT_CODE_SEQUENCE_KEY,
    String(Math.min(next, MAX_PRODUCT_CODE)),
  );
};
const reserveNextProductCode = (items: Product[]) => {
  const used = new Set(
    items.map((item) => String(item.codigo_produto || "").trim()).filter(Boolean),
  );
  const stored = Number(localStorage.getItem(PRODUCT_CODE_SEQUENCE_KEY));
  let next =
    Number.isInteger(stored) && stored >= PRODUCT_CODE_SEQUENCE_START
      ? stored
      : PRODUCT_CODE_SEQUENCE_START;
  while (used.has(String(next)) && next < MAX_PRODUCT_CODE) next += 1;
  if (used.has(String(next)) || next > MAX_PRODUCT_CODE)
    throw new Error("Sequência de Código do Produto esgotada");
  localStorage.setItem(
    PRODUCT_CODE_SEQUENCE_KEY,
    String(Math.min(next + 1, MAX_PRODUCT_CODE)),
  );
  return String(next);
};
const normalizeOversizedProductCodes = (items: Product[]) => {
  const used = new Set(
    items
      .map((item) => String(item.codigo_produto || "").trim())
      .filter((code) => /^\d+$/.test(code) && Number(code) <= MAX_PRODUCT_CODE),
  );
  let next = PRODUCT_CODE_SEQUENCE_START;
  return items.map((item) => {
    const code = String(item.codigo_produto || "").trim();
    if (!/^\d+$/.test(code) || Number(code) <= MAX_PRODUCT_CODE) return item;
    while (used.has(String(next)) && next < MAX_PRODUCT_CODE) next += 1;
    const replacement = String(next);
    used.add(replacement);
    next += 1;
    return { ...item, codigo_produto: replacement };
  });
};
const productCodeFromBarcode = (
  barcode: string,
  items: Product[],
  currentCode = "",
  currentId = "",
) => {
  const prefix = barcode.slice(0, 10);
  if (!prefix) return "";
  if (Number(prefix) <= MAX_PRODUCT_CODE) return prefix;
  const normalizedCurrent = currentCode.trim();
  const usedByAnotherProduct = items.some(
    (item) =>
      item._id !== currentId &&
      String(item.codigo_produto || "").trim() === normalizedCurrent,
  );
  if (
    /^\d+$/.test(normalizedCurrent) &&
    Number(normalizedCurrent) >= PRODUCT_CODE_SEQUENCE_START &&
    Number(normalizedCurrent) <= MAX_PRODUCT_CODE &&
    !usedByAnotherProduct
  )
    return normalizedCurrent;
  return reserveNextProductCode(items);
};
const generateUniqueEan13 = (used: Set<string>) => {
  let code = "";
  do {
    const random = crypto.getRandomValues(new Uint32Array(12));
    const body = Array.from(random, (number, index) =>
      String(index === 0 ? 1 + (number % 9) : number % 10),
    ).join("");
    const sum = [...body].reduce(
      (total, digit, index) =>
        total + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0,
    );
    code = body + String((10 - (sum % 10)) % 10);
  } while (used.has(code));
  return code;
};
const productIssue = (x: Product): ValidationIssue | undefined => {
  const nome = x.nome.trim();
  const productCode = String(x.codigo_produto || "").trim();
  const grade1 = String(x.grade_1 || "").trim();
  const grade2 = String(x.grade_2 || "").trim();
  if (!nome) return { tab: "produto", message: "Informe o nome do produto" };
  if (nome.length > 60)
    return {
      tab: "produto",
      message: "O nome deve ter no máximo 60 caracteres",
    };
  if (!x.preco_venda.trim())
    return { tab: "precos", message: "Informe o preço de venda" };
  const invalidPrice = PRICE_FIELDS.find((field) => {
    const value = String(x[field] ?? "").trim();
    if (!value) return false;
    const number = parsePrice(value);
    return number === undefined || number < 0;
  });
  if (invalidPrice)
    return {
      tab: "precos",
      message: "Informe preços válidos, maiores ou iguais a zero",
    };
  if (productCode && !/^\d+$/.test(productCode))
    return {
      tab: "produto",
      message: "O Código do Produto deve conter somente números",
    };
  if (productCode && Number(productCode) > MAX_PRODUCT_CODE)
    return {
      tab: "produto",
      message: "O Código do Produto deve ser menor ou igual a 2147483647",
    };
  if (x.variants.length && !productCode)
    return {
      tab: "produto",
      message: "Produtos com grade precisam de um Código do Produto numérico",
    };
  if ((grade1 || grade2) && !x.variants.length)
    return {
      tab: "grades",
      message: "Adicione uma variação ou remova os nomes das grades",
    };
  if ((grade2 || x.variants.some((v) => v.b.trim())) && !grade1)
    return {
      tab: "grades",
      message: "Informe a Grade 1 antes de utilizar a Grade 2",
    };
  if (
    grade1.length > 40 ||
    grade2.length > 40 ||
    x.variants.some((v) => v.a.trim().length > 40 || v.b.trim().length > 40)
  )
    return {
      tab: "grades",
      message: "Nomes e opções de grade devem ter no máximo 40 caracteres",
    };
  if (x.variants.some((v) => !v.a.trim() && !v.b.trim()))
    return { tab: "grades", message: "Remova ou preencha as variações vazias" };
  if (
    x.variants.some((v) => (v.a.trim() && !grade1) || (v.b.trim() && !grade2))
  )
    return {
      tab: "grades",
      message: "Informe o nome da grade correspondente a cada opção",
    };
  if (
    x.variants.some(
      (v) =>
        (Boolean(grade1) && !v.a.trim()) || (Boolean(grade2) && !v.b.trim()),
    )
  )
    return {
      tab: "grades",
      message: "Preencha todas as opções das grades antes de salvar",
    };
  const combinations = x.variants.map(
    (v) =>
      `${v.a.trim().toLocaleLowerCase("pt-BR")}\u0000${v.b.trim().toLocaleLowerCase("pt-BR")}`,
  );
  if (new Set(combinations).size !== combinations.length)
    return { tab: "grades", message: "Não repita a mesma combinação de grade" };
  if (x.variants.some((v) => v.barcode.trim().length > 18))
    return {
      tab: "grades",
      message:
        "O código de barras da variação deve ter no máximo 18 caracteres",
    };
  if (x.variants.length && x.variants.some((v) => !validStock(v.stock)))
    return {
      tab: "grades",
      message:
        "O estoque de cada variação deve ser um número maior ou igual a zero",
    };
  if (!x.variants.length && !validStock(x.estoque))
    return {
      tab: "precos",
      message: "O estoque deve ser um número maior ou igual a zero",
    };
  return undefined;
};
const loadProducts = (): Product[] => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem("hiper-products-final") || "[]",
    );
    const products = Array.isArray(parsed)
      ? (parsed
          .filter((item) => item && typeof item === "object")
          .map((item) =>
            normalizeProductPrices({
              ...blank(),
              ...item,
              nome: String(item.nome ?? ""),
              preco_venda: String(item.preco_venda ?? ""),
              enviar_dados_balanca: item.enviar_dados_balanca === true,
              variants: Array.isArray(item.variants)
                ? item.variants
                    .filter(
                      (variant: unknown) =>
                        variant && typeof variant === "object",
                    )
                    .map((variant: Record<string, unknown>) => ({
                      a: String(variant.a ?? ""),
                      b: String(variant.b ?? ""),
                      barcode: String(variant.barcode ?? ""),
                      stock: String(variant.stock ?? ""),
                    }))
                : [],
            } as Product),
          ) as Product[])
      : [];
    const normalized = normalizeOversizedProductCodes(products);
    syncProductCodeSequence(normalized);
    return normalized;
  } catch {
    return [];
  }
};
function Input({
  label,
  name,
  p,
  set,
  required = false,
}: {
  label: string;
  name: string;
  p: Product;
  set: (k: string, v: string) => void;
  required?: boolean;
}) {
  const price = isPriceField(name);
  const maxLength =
    name === "nome"
      ? 60
      : ["grade_1", "grade_2"].includes(name)
        ? 40
        : undefined;
  return (
    <label className="field">
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      <input
        maxLength={maxLength}
        inputMode={price ? "decimal" : undefined}
        placeholder={price ? "0,00" : undefined}
        value={String(p[name] ?? "")}
        onChange={(e) =>
          set(name, price ? priceInput(e.target.value) : e.target.value)
        }
        onBlur={() => {
          if (price && String(p[name] ?? "").trim())
            set(name, priceForInput(p[name]));
        }}
      />
      {price && <small>Use até 2 casas decimais.</small>}
    </label>
  );
}
const group = {
  produto: [
    ["Código do produto", "codigo_produto"],
    ["Código de barras", "codigo_de_barras"],
    ["Nome do produto", "nome"],
    ["Referência interna", "referencia_interna"],
  ],
  precos: [
    ["Preço de venda", "preco_venda"],
    ["Preço mínimo", "preco_minimo_de_venda"],
    ["Preço de custo", "preco_custo"],
    ["Preço do fornecedor", "preco_fornecedor"],
    ["Estoque atual (produto sem grade)", "estoque"],
    ["Estoque mínimo", "estoque_minimo"],
    ["Peso", "peso"],
  ],
  organizacao: [
    ["Marca", "marca_do_produto"],
    ["Categoria", "categoria"],
    ["Subcategoria nível 1", "subcategoria_nivel_1"],
    ["Subcategoria nível 2", "subcategoria_nivel_2"],
    ["CPF/CNPJ do fornecedor", "cnpj_fornecedor"],
    ["Nome do fornecedor", "nome_do_fornecedor"],
    ["Multiplicador", "multiplicador"],
    ["Sigla do pacote", "sigla_pacote"],
  ],
  fiscal: [
    ["NCM", "ncm"],
    ["CEST", "cest"],
    ["CST ICMS", "codigo_situacao_tributaria_icms"],
    ["Alíquota ICMS (%)", "aliquota_icms"],
    ["CSOSN", "csosn"],
    ["CST PIS/COFINS", "codigo_situacao_tributaria_pis"],
    ["Alíquota PIS (%)", "aliquota_pis"],
    ["Alíquota COFINS (%)", "aliquota_cofins"],
    ["CST IPI", "codigo_situacao_tributaria_ipi"],
    ["Alíquota IPI (%)", "aliquota_ipi"],
    ["Enquadramento IPI", "enquadramento_de_ipi"],
    ["MVA (%)", "mva"],
    ["Redução base ICMS (%)", "reducao_na_base_de_calculo"],
  ],
};
export default function App() {
  const [products, setProducts] = useState<Product[]>(loadProducts);
  const [p, setP] = useState(blank);
  const [tab, setTab] = useState<Tab>("produto");
  const [editing, setEditing] = useState(false);
  const [useSecondGrade, setUseSecondGrade] = useState(false);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const set = (k: string, v: string | boolean | Variant[]) =>
    setP((x) => ({ ...x, [k]: v }));
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2500);
  };
  const saveList = (x: Product[]) => {
    syncProductCodeSequence(x);
    setProducts(x);
    localStorage.setItem("hiper-products-final", JSON.stringify(x));
  };
  const reset = () => {
    setP(blank());
    setEditing(false);
    setUseSecondGrade(false);
    setTab("produto");
  };
  const list = useMemo(
    () =>
      products.filter((x) =>
        `${x.nome} ${x.codigo_produto} ${x.codigo_de_barras}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [products, q],
  );
  const duplicateBarcodes = useMemo(
    () => duplicateBarcodesOf(products),
    [products],
  );
  const duplicateProductCodes = useMemo(
    () => duplicateProductCodesOf(products),
    [products],
  );
  const ready = useMemo(
    () =>
      products.filter(
        (x) =>
          !productIssue(x) &&
          !productBarcodes(x).some((code) => duplicateBarcodes.has(code)) &&
          !duplicateProductCodes.has(String(x.codigo_produto || "").trim()),
      ).length,
    [products, duplicateBarcodes, duplicateProductCodes],
  );
  function generateInternalCode() {
    const used = new Set(
      [
        ...products.flatMap(productBarcodes),
        String(p.codigo_de_barras || ""),
        ...p.variants.map((variant) => variant.barcode),
      ].filter(Boolean),
    );
    const code = generateUniqueEan13(used);
    const productCode = productCodeFromBarcode(
      code,
      products,
      String(p.codigo_produto || ""),
      p._id,
    );
    setP((x) => ({
      ...x,
      codigo_de_barras: code,
      codigo_produto: productCode,
    }));
    flash(
      Number(code.slice(0, 10)) > MAX_PRODUCT_CODE
        ? "Código de barras gerado com Código do Produto sequencial"
        : "Código interno gerado e replicado",
    );
  }
  function generateSequentialProductCode() {
    try {
      const code = reserveNextProductCode(products);
      set("codigo_produto", code);
      flash(`Código do Produto ${code} gerado`);
    } catch {
      flash("Não há mais códigos disponíveis na sequência");
    }
  }
  function generateVariantBarcode(index: number) {
    const used = new Set(
      [
        ...products.flatMap(productBarcodes),
        String(p.codigo_de_barras || ""),
        ...p.variants.map((variant) => variant.barcode),
      ].filter(Boolean),
    );
    const code = generateUniqueEan13(used);
    set(
      "variants",
      p.variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, barcode: code } : variant,
      ),
    );
    flash("Código interno gerado para a variação");
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (useSecondGrade && !String(p.grade_2 || "").trim()) {
      setTab("grades");
      return flash("Informe o nome da Grade 2");
    }
    const issue = productIssue(p);
    if (issue) {
      setTab(issue.tab);
      return flash(issue.message);
    }
    const item = normalizeProductPrices({
      ...p,
      nome: p.nome.trim(),
      ncm: String(p.ncm || "00000000"),
      origem_produto: String(p.origem_produto || "0"),
    });
    const next = normalizeOversizedProductCodes(
      editing
        ? products.map((x) => (x._id === p._id ? item : x))
        : [item, ...products],
    );
    if (hasDuplicateProductCode(next)) {
      setTab("produto");
      return flash(
        "O Código do Produto não pode se repetir em produtos diferentes",
      );
    }
    if (hasDuplicateBarcode(next)) {
      setTab("grades");
      return flash(
        "O código de barras não pode se repetir entre produtos ou variações",
      );
    }
    saveList(next);
    flash(editing ? "Produto atualizado" : "Produto adicionado");
    reset();
  }
  function exportCsv() {
    if (!products.length) return flash("Cadastre ao menos um produto");
    const exportProducts = normalizeOversizedProductCodes(products);
    if (
      exportProducts.some(
        (item, index) => item.codigo_produto !== products[index].codigo_produto,
      )
    )
      saveList(exportProducts);
    const invalid = exportProducts
      .map((product) => ({ product, issue: productIssue(product) }))
      .find((result) => result.issue);
    if (invalid?.issue) {
      setP(invalid.product);
      setEditing(true);
      setUseSecondGrade(
        Boolean(
          String(invalid.product.grade_2 || "").trim() ||
            invalid.product.variants.some((variant) => variant.b.trim()),
        ),
      );
      setTab(invalid.issue.tab);
      return flash(invalid.issue.message);
    }
    if (hasDuplicateProductCode(exportProducts))
      return flash(
        "Existem Códigos do Produto repetidos em produtos diferentes",
      );
    if (hasDuplicateBarcode(exportProducts))
      return flash(
        "Existem códigos de barras repetidos entre produtos ou variações",
      );
    const rows: Record<string, unknown>[] = [];
    [...exportProducts].reverse().forEach((x) => {
      const base = Object.fromEntries(headers.map((h) => [h, x[h] ?? ""]));
      base.nome = x.nome.trim();
      base.ncm = base.ncm || "00000000";
      base.origem_produto = base.origem_produto || "0";
      base.enviar_dados_balanca = x.enviar_dados_balanca ? "true" : "false";
      PRICE_FIELDS.forEach((field) => {
        base[field] = priceForHiper(x[field]);
      });
      if (x.variants.length) {
        x.variants.forEach((v, index) =>
          rows.push({
            ...base,
            codigo_de_barras:
              v.barcode || (index === 0 ? base.codigo_de_barras : ""),
            estoque: v.stock,
            opcao_de_grade_1: v.a,
            opcao_de_grade_2: v.b,
          }),
        );
      } else {
        base.grade_1 = "";
        base.grade_2 = "";
        base.opcao_de_grade_1 = "";
        base.opcao_de_grade_2 = "";
        rows.push(base);
      }
    });
    const data =
      "\ufeff" +
      headers.join(";") +
      "\r\n" +
      rows.map((r) => headers.map((h) => csv(r[h])).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([data], { type: "text/csv;charset=utf-8" }),
    );
    a.download = "produtos-hiper.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    flash("Planilha exportada");
  }
  async function importCsv(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const lines = parseCsvRows((await f.text()).replace(/^\ufeff/, ""));
      const hs = lines.shift()?.map((value) => value.trim()) || [];
      if (!hs.includes("nome") || !hs.includes("preco_venda"))
        throw new Error("Colunas obrigatórias ausentes");
      const at = (r: string[], k: string) => {
        const index = hs.indexOf(k);
        return index >= 0 ? r[index] || "" : "";
      };
      const incoming: Product[] = [];
      let cur: Product | undefined;
      lines.forEach((r) => {
        const nome = at(r, "nome").trim();
        const codigo = at(r, "codigo_produto").trim();
        const referencia = at(r, "referencia_interna").trim();
        const grade1 = at(r, "grade_1").trim();
        const grade2 = at(r, "grade_2").trim();
        const optionA = at(r, "opcao_de_grade_1").trim();
        const optionB = at(r, "opcao_de_grade_2").trim();
        const isVariant = Boolean(optionA || optionB);
        const sameProduct = Boolean(
          cur &&
          isVariant &&
          ((codigo &&
            String(cur.codigo_produto) === codigo &&
            (!nome || cur.nome === nome)) ||
            (!codigo &&
              cur.nome === nome &&
              String(cur.referencia_interna || "") === referencia &&
              String(cur.grade_1 || "") === grade1 &&
              String(cur.grade_2 || "") === grade2)),
        );
        if (sameProduct && cur) {
          cur.variants.push({
            a: optionA,
            b: optionB,
            barcode: at(r, "codigo_de_barras").trim(),
            stock: at(r, "estoque").trim(),
          });
          return;
        }
        if (nome) {
          cur = blank();
          headers.forEach((k) => (cur![k] = at(r, k)));
          cur.nome = nome;
          PRICE_FIELDS.forEach((field) => {
            cur![field] = priceForInput(at(r, field));
          });
          cur.ncm = at(r, "ncm") || "00000000";
          cur.origem_produto = at(r, "origem_produto") || "0";
          cur.enviar_dados_balanca = parseBoolean(
            at(r, "enviar_dados_balanca"),
          );
          cur.variants = [];
          if (isVariant)
            cur.variants.push({
              a: optionA,
              b: optionB,
              barcode: at(r, "codigo_de_barras").trim(),
              stock: at(r, "estoque").trim(),
            });
          incoming.push(cur);
        } else if (cur && isVariant) {
          cur.variants.push({
            a: optionA,
            b: optionB,
            barcode: at(r, "codigo_de_barras").trim(),
            stock: at(r, "estoque").trim(),
          });
        }
      });
      const merged = normalizeOversizedProductCodes([...incoming, ...products]);
      if (hasDuplicateProductCode(merged)) {
        flash("Importação cancelada: existem Códigos do Produto repetidos");
        e.target.value = "";
        return;
      }
      saveList(merged);
      flash(`${incoming.length} produto(s) importado(s)`);
    } catch {
      flash("Não foi possível importar o arquivo");
    }
    e.target.value = "";
  }
  const tabs: [Tab, string][] = [
    ["produto", "Produto"],
    ["precos", "Preços e estoque"],
    ["organizacao", "Organização"],
    ["grades", "Grades"],
    ["fiscal", "Fiscal"],
  ];
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span>
            <Box />
          </span>
          Estoque inicial
        </div>
        <p>Cadastre seus produtos e gere o arquivo para o Hiper Gestão.</p>
        <ol>
          <li>Dados do produto</li>
          <li>Preços e estoque</li>
          <li>Classificação e grades</li>
          <li>Tributação</li>
          <li>Exportar CSV</li>
        </ol>
        <small>
          Os dados ficam salvos neste navegador. Exporte uma cópia de segurança.
        </small>
      </aside>
      <main>
        <header>
          <div>
            <em>Nova loja</em>
            <h1>Cadastro de produtos</h1>
            <p>Uma ficha simples para preparar sua importação.</p>
          </div>
          <div className="actions">
            <label className="btn light">
              <FileUp />
              Importar CSV
              <input
                hidden
                type="file"
                accept=".csv,.txt"
                onChange={importCsv}
              />
            </label>
            <button className="btn dark" onClick={exportCsv}>
              <Download />
              Exportar para o Hiper
            </button>
          </div>
        </header>
        <section className="stats">
          <article>
            <strong>{products.length}</strong>
            <span>produtos cadastrados</span>
          </article>
          <article>
            <strong>
              {products.reduce((n, x) => n + x.variants.length, 0)}
            </strong>
            <span>variações de grade</span>
          </article>
          <article>
            <strong>{ready}</strong>
            <span>prontos para exportar</span>
          </article>
        </section>
        <div className="workspace">
          <form className="card editor" onSubmit={submit}>
            <nav>
              {tabs.map(([id, l]) => (
                <button
                  type="button"
                  className={tab === id ? "active" : ""}
                  onClick={() => setTab(id)}
                  key={id}
                >
                  {l}
                </button>
              ))}
            </nav>
            <section className="panel">
              <h2>
                {tab === "produto"
                  ? "Identificação"
                  : tab === "precos"
                    ? "Preços e estoque"
                    : tab === "organizacao"
                      ? "Organização e fornecedor"
                      : tab === "grades"
                        ? "Grades e variações"
                        : "Informações fiscais"}
              </h2>
              <p className="hint">
                {tab === "fiscal"
                  ? "NCM 00000000 e origem 0 — Nacional são aplicados por padrão."
                  : "Preencha os dados disponíveis para este produto."}
              </p>
              {tab === "grades" ? (
                <>
                  <div className="grade-mode" aria-label="Quantidade de grades">
                    <button
                      type="button"
                      className={!useSecondGrade ? "active" : ""}
                      onClick={() => {
                        setUseSecondGrade(false);
                        setP((current) => ({
                          ...current,
                          grade_2: "",
                          variants: current.variants.map((variant) => ({
                            ...variant,
                            b: "",
                          })),
                        }));
                      }}
                    >
                      1 grade
                    </button>
                    <button
                      type="button"
                      className={useSecondGrade ? "active" : ""}
                      onClick={() => setUseSecondGrade(true)}
                    >
                      2 grades
                    </button>
                  </div>
                  <div className={`grid grade-names ${useSecondGrade ? "" : "single"}`}>
                    <Input
                      label="Nome da grade 1"
                      name="grade_1"
                      p={p}
                      set={set}
                    />
                    {useSecondGrade && (
                      <Input
                        label="Nome da grade 2"
                        name="grade_2"
                        p={p}
                        set={set}
                      />
                    )}
                  </div>
                  <div className="variants">
                    {p.variants.map((v, i) => (
                      <div
                        className={`variant ${useSecondGrade ? "" : "single"}`}
                        key={i}
                      >
                        <input
                          className="variant-option"
                          maxLength={40}
                          placeholder="Opção 1"
                          value={v.a}
                          onChange={(e) =>
                            set(
                              "variants",
                              p.variants.map((x, j) =>
                                j === i ? { ...x, a: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        {useSecondGrade && (
                          <input
                            className="variant-option"
                            maxLength={40}
                            placeholder="Opção 2"
                            value={v.b}
                            onChange={(e) =>
                              set(
                                "variants",
                                p.variants.map((x, j) =>
                                  j === i ? { ...x, b: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        )}
                        <div className="variant-barcode">
                          <input
                            maxLength={18}
                            placeholder="Código de barras"
                            value={v.barcode}
                            onChange={(e) =>
                              set(
                                "variants",
                                p.variants.map((x, j) =>
                                  j === i
                                    ? { ...x, barcode: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                          <button
                            type="button"
                            className="variant-generate"
                            title="Gerar código interno de 13 dígitos"
                            aria-label={`Gerar código de barras da variação ${i + 1}`}
                            onClick={() => generateVariantBarcode(i)}
                          >
                            <Barcode />
                          </button>
                        </div>
                        <input
                          className="variant-stock"
                          inputMode="decimal"
                          placeholder="Estoque da variação"
                          value={v.stock}
                          onChange={(e) =>
                            set(
                              "variants",
                              p.variants.map((x, j) =>
                                j === i ? { ...x, stock: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="variant-remove"
                          aria-label={`Remover variação ${i + 1}`}
                          onClick={() =>
                            set(
                              "variants",
                              p.variants.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <Trash2 />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn light add"
                    onClick={() =>
                      set("variants", [
                        ...p.variants,
                        { a: "", b: "", barcode: "", stock: "" },
                      ])
                    }
                  >
                    <Plus />
                    Adicionar variação
                  </button>
                </>
              ) : (
                <div className="grid">
                  {tab === "produto" && (
                    <>
                      <div className="field product-code-field">
                        <span>Código do produto</span>
                        <div className="input-action">
                          <input
                            inputMode="numeric"
                            value={String(p.codigo_produto || "")}
                            onChange={(e) =>
                              set(
                                "codigo_produto",
                                e.target.value.replace(/\D/g, "").slice(0, 10),
                              )
                            }
                          />
                          <button
                            type="button"
                            className="generate sequence-generate"
                            onClick={generateSequentialProductCode}
                          >
                            <Plus />
                            Próximo código
                          </button>
                        </div>
                        <small>
                          A sequência fica salva neste navegador e continua na
                          próxima utilização.
                        </small>
                      </div>
                      <div className="field barcode-field">
                        <span>Código de barras</span>
                        <div className="input-action">
                          <input
                            inputMode="numeric"
                            maxLength={13}
                            value={String(p.codigo_de_barras)}
                            onChange={(e) => {
                              const barcode = e.target.value
                                .replace(/\D/g, "")
                                .slice(0, 13);
                              setP((current) => ({
                                ...current,
                                codigo_de_barras: barcode,
                                codigo_produto: productCodeFromBarcode(
                                  barcode,
                                  products,
                                  String(current.codigo_produto || ""),
                                  current._id,
                                ),
                              }));
                            }}
                          />
                          <button
                            type="button"
                            className="generate"
                            onClick={generateInternalCode}
                          >
                            <Barcode />
                            Gerar 13 dígitos
                          </button>
                        </div>
                        <small>
                          Os 10 primeiros dígitos são usados como Código do
                          Produto. Se ultrapassarem 2147483647, será usada uma
                          sequência a partir de 1000000000. Para uso comercial
                          oficial, utilize um GTIN emitido pela GS1.
                        </small>
                      </div>
                    </>
                  )}
                  {group[tab]
                    .filter(
                      ([, n]) =>
                        tab !== "produto" ||
                        !["codigo_produto", "codigo_de_barras"].includes(n),
                    )
                    .map(([l, n]) => (
                      <Input
                        key={n}
                        label={l}
                        name={n}
                        p={p}
                        set={set}
                        required={n === "nome" || n === "preco_venda"}
                      />
                    ))}
                  {tab === "produto" && (
                    <label className="field">
                      <span>Unidade de medida</span>
                      <select
                        value={String(p.sigla_da_unidade_de_medida)}
                        onChange={(e) =>
                          set("sigla_da_unidade_de_medida", e.target.value)
                        }
                      >
                        {["UN", "PCT", "KG", "MT", "CX"].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {tab === "fiscal" && (
                    <label className="field">
                      <span>Origem da mercadoria</span>
                      <select
                        value={String(p.origem_produto)}
                        onChange={(e) => set("origem_produto", e.target.value)}
                      >
                        {[
                          "0 — Nacional",
                          "1 — Estrangeira, importação direta",
                          "2 — Estrangeira, mercado interno",
                          "3 — Nacional, conteúdo importado >40% e ≤70%",
                          "4 — Nacional, processo produtivo básico",
                          "5 — Nacional, conteúdo importado ≤40%",
                          "6 — Estrangeira, sem similar nacional",
                          "7 — Estrangeira no mercado interno, sem similar",
                          "8 — Nacional, conteúdo importado >70%",
                        ].map((x, i) => (
                          <option value={i} key={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </section>
            <footer>
              <div>
                {editing ? "Editando produto" : "Novo produto"}
                {editing && (
                  <button
                    type="button"
                    className="delete"
                    onClick={() => {
                      if (confirm("Excluir este produto?")) {
                        saveList(products.filter((x) => x._id !== p._id));
                        reset();
                      }
                    }}
                  >
                    Excluir
                  </button>
                )}
              </div>
              <div className="actions">
                <button type="button" className="btn light" onClick={reset}>
                  Limpar
                </button>
                <button className="btn primary">Salvar produto</button>
              </div>
            </footer>
          </form>
          <section className="card catalog">
            <h2>Produtos</h2>
            <label className="search">
              <Search />
              <input
                placeholder="Buscar produto ou código"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <div className="list">
              {list.length ? (
                list.map((x) => (
                  <button
                    className="product"
                    key={x._id}
                    onClick={() => {
                      setP({
                        ...blank(),
                        ...x,
                        ncm: String(x.ncm || "00000000"),
                        origem_produto: String(x.origem_produto || "0"),
                      });
                      setUseSecondGrade(
                        Boolean(
                          String(x.grade_2 || "").trim() ||
                            x.variants.some((variant) => variant.b.trim()),
                        ),
                      );
                      setEditing(true);
                      setTab("produto");
                      scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <span>
                      <b>{x.nome}</b>
                      <small>
                        {String(
                          x.codigo_produto ||
                            x.codigo_de_barras ||
                            "Sem código",
                        )}{" "}
                        · {String(x.sigla_da_unidade_de_medida || "UN")}
                      </small>
                    </span>
                    <strong>{brl(x.preco_venda)}</strong>
                  </button>
                ))
              ) : (
                <div className="empty">
                  Nenhum produto cadastrado.
                  <br />
                  Comece preenchendo a ficha.
                </div>
              )}
            </div>
            <button
              type="button"
              className="clear-list"
              disabled={!products.length}
              onClick={() => {
                if (
                  confirm(
                    "Limpar todos os produtos salvos neste navegador? Esta ação não pode ser desfeita.",
                  )
                ) {
                  saveList([]);
                  reset();
                  flash("Lista de produtos removida");
                }
              }}
            >
              <Trash2 />
              Limpar lista de produtos
            </button>
          </section>
        </div>
      </main>
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
