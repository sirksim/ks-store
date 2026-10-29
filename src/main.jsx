import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { flexRender, useTable } from "@tanstack/react-table";
import {
  LayoutDashboard,
  Package,
  Truck,
  ShoppingBag,
  Boxes,
  Receipt,
  Download,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Smartphone,
  Search,
  ArrowUpRight,
  Wallet,
  TrendingUp,
  AlertTriangle,
  HardDriveDownload,
  Filter,
  Eye,
  Users,
  Contact,
  ClipboardList,
  Printer,
} from "lucide-react";
import {
  catalogProducts,
  cloneInitial,
  derive,
  findProduct,
  generateProductCode,
  money,
  normalizeState,
  percent,
  nextPurchaseOrderNumber,
  nextSaleNumber,
  saleNumber,
  saleLines,
  productName,
  uid,
} from "./data";
import { downloadCsv, exportReportCsv, selectedTableRows } from "./csv";
import { updateFilteredSelection } from "./tableSelection";
import {
  dataTableFeatures,
  searchAcrossRow,
  textColumnFilter,
} from "./tableConfig";
import MultiSelect from "./MultiSelect";
import "./style.css";
import "./productDetail.css";
import "./drawer.css";
import "./contacts.css";
import "./documentDetail.css";
import "./documentEditor.css";
import {
  go,
  parseRoute,
  pathFor,
  readTableQuery,
  writeTableQuery,
  replaceQuery,
} from "./routes";
import { useSharedData } from "./useSharedData";
import { selectedRows, updatePublication } from "./publication";
import {
  hasLinkedReceipts,
  orderStageForAction,
  saleStatusForAction,
  prepareInlineProduct,
  prepareInlineSupplier,
} from "./documentWorkflow";

const DrawerContext = createContext(null);

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};
const navItems = [
  ["overview", "Vue d’ensemble", LayoutDashboard],
  ["products", "Produits", Package],
  ["suppliers", "Fournisseurs", Contact],
  ["purchaseOrders", "Bons de commande", ClipboardList],
  ["receipts", "Réceptions", Truck],
  ["customers", "Clients", Users],
  ["sales", "Ventes", ShoppingBag],
  ["stock", "Stock", Boxes],
  ["expenses", "Dépenses", Receipt],
  ["reports", "Rapports", Download],
];
const saleStatusLabel = (status) => ({ "En attente": "Brouillon", "Confirmée/Vendue": "Vendue", "Annulée": "Annulée" })[status] || status;
const reportTypes = [
  ["synthese", "Synthèse", "Indicateurs du tableau de bord"],
  ["ventes", "Ventes", "Transactions et marges réelles"],
  ["stock", "Stock", "Quantités et bénéfices par produit"],
  ["receptions", "Réceptions", "Historique des achats"],
  ["commandes", "Bons de commande", "Prévisions et réceptions"],
  ["fournisseurs", "Fournisseurs", "Coordonnées des fournisseurs"],
  ["clients", "Clients", "Coordonnées des clients"],
  ["produits", "Produits", "Catalogue et prix conseillés"],
  ["depenses", "Dépenses", "Frais enregistrés"],
];
const defaults = {
  family: { name: "", category: "" },
  variant: {
    code: "",
    variant: "",
    format: "",
    unitsPerCase: 6,
    margin: "",
    picture: null,
    published: false,
  },
  supplier: {
    name: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    note: "",
  },
  customer: {
    name: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    note: "",
  },
  purchaseOrder: {
    date: today(),
    number: "",
    supplierId: "",
    stage: "draft",
    note: "",
    lines: [],
  },
  invoice: {
    date: today(),
    supplierId: "",
    supplier: "",
    purchaseOrderId: "",
    number: "",
    note: "",
    lines: [],
  },
  sale: {
    date: today(),
    number: "",
    order: "",
    customerId: "",
    client: "",
    lines: [],
    status: "En attente",
    payment: "",
    note: "",
  },
  expense: {
    date: today(),
    category: "Transport",
    description: "",
    amount: "",
    paidBy: "",
    note: "",
  },
};

function App() {
  const {
    data,
    setData,
    status: syncStatus,
    pendingCount,
    conflicts,
    resolveConflict,
    importBackup,
    refresh,
  } = useSharedData();
  const [route, setRoute] = useState(() =>
    parseRoute(window.location.pathname),
  );
  const [routeVersion, setRouteVersion] = useState(0);
  const page = route.page;
  const productTab = page === "products" && new URLSearchParams(window.location.search).get("tab") === "publication"
    ? "publication" : "families";
  const selectedFamilyId = page === "productDetail" ? route.id : null;
  const selectedContactId =
    page === "supplierDetail" || page === "customerDetail" ? route.id : null;
  const selectedInvoiceId = page === "invoiceDetail" ? route.id : null;
  const selectedSaleId = page === "saleDetail" ? route.id : null;
  const selectedOrderId = page === "orderDetail" ? route.id : null;
  const editingDocument = page === "orderEditor" || page === "invoiceEditor" || page === "saleEditor";
  const [contactReturnPage, setContactReturnPage] = useState(null);
  const previousPage = window.history.state?.previous
    ? parseRoute(
        new URL(window.history.state.previous, window.location.origin).pathname,
      ).page
    : null;
  const [printOrderId, setPrintOrderId] = useState(null);
  const [printInvoiceId, setPrintInvoiceId] = useState(null);
  const [printSaleId, setPrintSaleId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const workspaceRef = useRef(null);
  const [notice, setNotice] = useState("");
  const [syncError, setSyncError] = useState("");
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const report = useMemo(() => derive(data), [data]);
  const catalog = useMemo(() => catalogProducts(data), [data]);
  const setPublished = (codes, published) => {
    setData((current) => ({ ...current, products: updatePublication(current.products, codes, published) }));
  };
  const setProductTab = (tab) => {
    replaceQuery((params) => {
      for (const key of [...params.keys()])
        if (["q", "sort", "hide", "page"].includes(key) || key.startsWith("filter.")) params.delete(key);
      if (tab === "publication") params.set("tab", "publication");
      else params.delete("tab");
    });
    setDrawer(null);
    setRouteVersion((value) => value + 1);
  };
  const selectedFamily = report.families.find(
    (family) => family.id === selectedFamilyId,
  );
  const selectedContact = (
    page === "supplierDetail"
      ? data.suppliers
      : page === "customerDetail"
        ? data.customers
        : []
  ).find((contact) => contact.id === selectedContactId);
  const printOrder = report.purchaseOrders.find(
    (order) => order.id === printOrderId,
  );
  const printInvoice = report.invoices.find(
    (invoice) => invoice.id === printInvoiceId,
  );
  const printSale = report.sales.find((sale) => sale.id === printSaleId);
  const selectedInvoice = report.invoices.find(
    (invoice) => invoice.id === selectedInvoiceId,
  );
  const selectedSale = report.sales.find((sale) => sale.id === selectedSaleId);
  const selectedOrder = report.purchaseOrders.find(
    (order) => order.id === selectedOrderId,
  );
  const pageTitle =
    page === "productDetail"
      ? selectedFamily?.name || "Produit"
      : page === "orderEditor"
        ? `${route.id ? "Modifier" : "Nouveau"} bon de commande`
        : page === "invoiceEditor"
          ? `${route.id ? "Modifier" : "Nouvelle"} réception`
          : page === "saleEditor"
            ? `${route.id ? "Modifier" : "Nouvelle"} vente`
            : page === "saleDetail"
              ? `Vente ${selectedSale?.number || "introuvable"}`
          : page === "invoiceDetail"
            ? `Facture ${selectedInvoice?.number || "Sans numéro"}`
            : page === "orderDetail"
              ? `PO ${selectedOrder?.number || "introuvable"}`
              : page === "supplierDetail" || page === "customerDetail"
                ? selectedContact?.name || "Fiche introuvable"
                : navItems.find(([key]) => key === page)?.[1] || "KS";
  const breaksConfirmedSales = (invoices) =>
    data.sales.some(
      (sale) =>
        sale.status === "Confirmée/Vendue" &&
        saleLines(sale).some(line => !derive({ ...data, invoices }).receipts.some(
          receipt => receipt.productCode === line.productCode && receipt.date <= sale.date)),
    );

  const closeDrawer = () =>
    setDrawer((current) => (current ? { ...current, open: false } : null));
  const navigate = (nextPage) => {
    closeDrawer();
    go(pathFor(nextPage));
  };
  const backTo = (fallback) => {
    closeDrawer();
    if (window.history.state?.fromApp) window.history.back();
    else go(pathFor(fallback), true);
  };
  const backFromDocument = () =>
    backTo(page === "orderDetail" ? "purchaseOrders" : page === "saleDetail" ? "sales" : "receipts");
  const openContactDetail = (type, id) => {
    if (
      !id ||
      !(type === "supplier" ? data.suppliers : data.customers).some(
        (contact) => contact.id === id,
      )
    )
      return;
    setContactReturnPage(page);
    closeDrawer();
    go(pathFor(type === "supplier" ? "supplierDetail" : "customerDetail", id));
  };
  const backFromContact = () =>
    backTo(page === "supplierDetail" ? "suppliers" : "customers");
  useEffect(() => {
    if (!window.history.state?.app)
      window.history.replaceState(
        { app: true, fromApp: false },
        "",
        window.location.href,
      );
    const update = () => {
      setRoute(parseRoute(window.location.pathname));
      setRouteVersion((value) => value + 1);
      closeDrawer();
    };
    window.addEventListener("popstate", update);
    window.addEventListener("app:navigate", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("app:navigate", update);
    };
  }, []);
  const showTableDrawer = (kind, mode) => {
    setDialog(null);
    setDrawer({ owner: "table", kind, mode, open: true });
  };
  useEffect(() => {
    if (!drawer || drawer.open) return;
    const timeout = setTimeout(() => {
      if (drawer.owner === "form") setDialog(null);
      setDrawer(null);
    }, 280);
    return () => clearTimeout(timeout);
  }, [drawer]);
  useEffect(() => {
    if (!drawer?.open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawer?.open]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const main = workspaceRef.current?.parentElement;
        const headerBottom = Math.max(
          0,
          ...[
            main?.querySelector(".topbar"),
            main?.querySelector(".mobile-nav"),
          ]
            .filter(
              (element) =>
                element && getComputedStyle(element).display !== "none",
            )
            .map((element) => element.getBoundingClientRect().bottom),
        );
        workspaceRef.current?.style.setProperty(
          "--drawer-top",
          `${Math.min(window.innerHeight, headerBottom)}px`,
        );
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    if (location.protocol === "https:" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          registrations
            .filter(
              (registration) =>
                registration.scope === `${location.origin}/` &&
                registration.active?.scriptURL.endsWith("/sw.js"),
            )
            .forEach((registration) => registration.unregister()),
        )
        .catch(() => {});
      navigator.serviceWorker
        .register("/admin/sw.js", { scope: "/admin/" })
        .catch(() => {});
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    if (!printOrderId && !printInvoiceId && !printSaleId) return;
    const timer = setTimeout(() => window.print(), 50);
    const clear = () => {
      setPrintOrderId(null);
      setPrintInvoiceId(null);
      setPrintSaleId(null);
    };
    window.addEventListener("afterprint", clear);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", clear);
    };
  }, [printOrderId, printInvoiceId, printSaleId]);

  const open = (type, item = null, seed = {}) => {
    const fields = item
      ? { ...item, search: item.productCode || "" }
      : structuredClone({ ...defaults[type], date: today(), ...seed });
    if (type === "sale") {
      fields.lines = item ? saleLines(item).map(line => ({ ...line, search: line.productCode })) : fields.lines;
      if (item) fields.number = saleNumber(item);
      if (!item) try { fields.number = nextSaleNumber(data.sales, fields.date); }
      catch (cause) { setNotice(cause.message); return; }
    }
    if (type === "invoice" && item)
      fields.lines = item.lines.map((line) => ({
        ...line,
        search: line.productCode,
      }));
    if (type === "purchaseOrder") {
      if (item)
        fields.lines = item.lines.map((line) => ({
          ...line,
          search: line.productCode,
        }));
      else
        fields.number = nextPurchaseOrderNumber(
          data.purchaseOrders,
          fields.date,
        );
    }
    if (type === "variant") {
      fields.margin = item?.margin ?? "";
      fields.format = item?.format || data.families.find((row) => row.id === item?.familyId)?.volume || "";
      if (!item)
        fields.code = generateProductCode(
          selectedFamily?.category,
          data.products,
        );
    }
    if (type === "purchaseOrder" || type === "invoice" || type === "sale") {
      const editorPage =
        type === "purchaseOrder" ? "orderEditor" : type === "sale" ? "saleEditor" : "invoiceEditor";
      const path = pathFor(editorPage, item?.id);
      const query = !item
        ? new URLSearchParams(
             type === "sale" ? { customerId: seed.customerId || "" } : type === "invoice"
              ? {
                  supplierId: seed.supplierId || "",
                  purchaseOrderId: seed.purchaseOrderId || "",
                }
              : { supplierId: seed.supplierId || "" },
          ).toString()
        : "";
      setDialog({
        type,
        id: item?.id || null,
        fields,
        error: "",
        editorPath: path,
      });
      setDrawer(null);
      go(`${path}${query ? `?${query}` : ""}`);
      return;
    }
    setDialog({
      type,
      id: type === "variant" ? item?.code : item?.id || null,
      fields,
      error: "",
    });
    setDrawer({ owner: "form", open: true });
  };
  useEffect(() => {
    if (!editingDocument) return;
    const type = page === "orderEditor" ? "purchaseOrder" : page === "saleEditor" ? "sale" : "invoice";
    const path = pathFor(page, route.id);
    if (dialog?.editorPath === path) return;
    const item = route.id
      ? (type === "purchaseOrder" ? data.purchaseOrders : type === "sale" ? data.sales : data.invoices).find(
          (row) => row.id === route.id,
        )
      : null;
    if (route.id && !item) {
      setDialog(null);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const seed = !route.id
      ? type === "sale" ? { customerId: params.get("customerId") || "" } : { supplierId: params.get("supplierId") || "" }
      : {};
    if (type === "invoice" && !route.id)
      seed.purchaseOrderId = params.get("purchaseOrderId") || "";
    const fields = item
      ? {
          ...item,
           lines: (type === "sale" ? saleLines(item) : item.lines).map((line) => ({
            ...line,
            search: line.productCode,
          })),
        }
      : structuredClone({ ...defaults[type], date: today(), ...seed });
    if (type === "purchaseOrder" && !item)
      fields.number = nextPurchaseOrderNumber(data.purchaseOrders, fields.date);
    if (type === "sale" && !item) try { fields.number = nextSaleNumber(data.sales, fields.date); }
    catch (cause) { fields.number = ""; }
    if (type === "sale" && item) fields.number = saleNumber(item);
    if (type === "invoice" && !item && fields.purchaseOrderId) {
      const order = report.purchaseOrders.find(
        (row) =>
          row.id === fields.purchaseOrderId &&
          row.supplierId === fields.supplierId &&
          row.stage === "ordered",
      );
      if (order)
        fields.lines = order.lines
          .filter((line) => line.remainingCases > 0)
          .map((line) => ({
            id: uid(),
            search: line.productCode,
            cases: line.remainingCases,
            casePrice: line.casePrice,
            note: "",
          }));
    }
    setDialog({
      type,
      id: item?.id || null,
      fields,
      error: type === "sale" && !fields.number ? "Les 1 000 numéros de vente de cette date sont utilisés." : "",
      editorPath: path,
    });
  }, [
    page,
    route.id,
    editingDocument,
    dialog?.editorPath,
    data.purchaseOrders,
    data.invoices,
    data.sales,
  ]);
  const setField = (name, value) => {
    let nextNumber;
    if (dialog?.type === "sale" && name === "date" && value !== dialog.fields.date && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      try { nextNumber = nextSaleNumber(data.sales, value, Math.random, dialog.id); }
      catch (cause) { fail(cause.message); return; }
    }
    setDialog((current) => ({
      ...current,
      fields: { ...current.fields, [name]: value, ...(nextNumber ? { number: nextNumber } : {}) },
      error: "",
    }));
  };
  const uploadPicture = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const targetId = dialog?.id || null;
    const targetCode = dialog?.fields.code;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5_000_000
    ) {
      fail("Choisis une image JPEG, PNG ou WebP de 5 Mo maximum.");
      event.target.value = "";
      return;
    }
    setUploadingPicture(true);
    try {
      const response = await fetch("/admin/api/picture", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Envoi impossible.");
      setDialog((current) =>
        current?.type === "variant" &&
        (current.id || null) === targetId &&
        current.fields.code === targetCode
          ? {
              ...current,
              fields: { ...current.fields, picture: result.picture },
              error: "",
            }
          : current,
      );
    } catch (error) {
      setDialog((current) =>
        current?.type === "variant" && (current.id || null) === targetId
          ? { ...current, error: error.message }
          : current,
      );
    } finally {
      setUploadingPicture(false);
      event.target.value = "";
    }
  };
  const selectInvoiceSupplier = (supplierId) =>
    setDialog((current) => ({
      ...current,
      error: "",
      fields: { ...current.fields, supplierId, purchaseOrderId: "" },
    }));
  const selectInvoiceOrder = (purchaseOrderId) => {
    const order = report.purchaseOrders.find(
      (row) => row.id === purchaseOrderId,
    );
    setDialog((current) => ({
      ...current,
      error: "",
      fields: {
        ...current.fields,
        purchaseOrderId,
        lines:
          !current.id && order
            ? order.lines
                .filter((line) => line.remainingCases > 0)
                .map((line) => ({
                  id: uid(),
                  search: line.productCode,
                  cases: line.remainingCases,
                  casePrice: line.casePrice,
                  note: "",
                }))
            : current.fields.lines,
      },
    }));
  };
  const addDocumentProduct = (product) =>
    setDialog((current) => {
      if (
        !current ||
        (current.type !== "invoice" && current.type !== "purchaseOrder")
      )
        return current;
      if (
        current.fields.lines.some(
          (line) =>
            line.search.toLocaleLowerCase("fr") ===
            product.code.toLocaleLowerCase("fr"),
        )
      )
        return current;
      const line = {
        id: uid(),
        search: product.code,
        cases: 1,
        casePrice: "",
        ...(current.type === "invoice" ? { note: "" } : {}),
      };
      return {
        ...current,
        error: "",
        fields: { ...current.fields, lines: [...current.fields.lines, line] },
      };
    });
  const createDocumentSupplier = (values) => {
    const supplier = prepareInlineSupplier(values, data.suppliers, uid);
    setData((current) => ({
      ...current,
      suppliers: [...current.suppliers, supplier],
    }));
    if (dialog.type === "invoice") selectInvoiceSupplier(supplier.id);
    else setField("supplierId", supplier.id);
    return supplier;
  };
  const createDocumentProduct = (values) => {
    const { family, variant } = prepareInlineProduct(
      values,
      data.families,
      catalog,
      uid,
    );
    setData((current) => ({
      ...current,
      families: [...current.families, family],
      products: [...current.products, variant],
    }));
    if (dialog.type === "sale") addSaleProduct(variant);
    else addDocumentProduct(variant);
    return variant;
  };
  const addSaleProduct = (product) => setDialog(current => {
    if (!current || current.type !== "sale" || current.fields.lines.some(line => line.search === product.code)) return current;
    const suggestedPrice = report.products.find(row => row.code === product.code)?.suggestedPrice;
    return { ...current, error: "", fields: { ...current.fields,
      lines: [...current.fields.lines, { id: uid(), search: product.code, quantity: 1,
        unitPrice: Number.isFinite(suggestedPrice) && suggestedPrice > 0 ? suggestedPrice : "" }] } };
  });
  const createSaleCustomer = values => {
    const name = String(values.name || "").trim();
    if (!name) throw new Error("Renseigne le nom du client.");
    if (data.customers.some(row => row.name.trim().toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")))
      throw new Error("Ce client existe déjà.");
    const customer = { id: uid(), name, contact: values.contact?.trim() || "", phone: values.phone?.trim() || "",
      email: values.email?.trim() || "", address: values.address?.trim() || "", note: "" };
    setData(current => ({ ...current, customers: [...current.customers, customer] }));
    setField("customerId", customer.id);
    return customer;
  };
  const setSaleLine = (index, name, value) => setDialog(current => ({ ...current, error: "",
    fields: { ...current.fields, lines: current.fields.lines.map((line, i) => i === index ? { ...line, [name]: value } : line) } }));
  const deleteSaleLine = index => setDialog(current => ({ ...current, error: "",
    fields: { ...current.fields, lines: current.fields.lines.filter((_, i) => i !== index) } }));
  const cancelDocumentOrder = () => {
    const order = data.purchaseOrders.find((row) => row.id === dialog?.id);
    const hasReceipts = hasLinkedReceipts(order?.id, data.invoices);
    if (!order || !orderStageForAction(order.stage, "cancel", hasReceipts))
      return fail("Cette commande ne peut plus être annulée.");
    if (
      !window.confirm(
        "Annuler cette commande ? Les modifications non enregistrées seront perdues.",
      )
    )
      return;
    setData((current) => ({
      ...current,
      purchaseOrders: current.purchaseOrders.map((row) =>
        row.id === order.id ? { ...row, stage: "cancelled" } : row,
      ),
    }));
    setDialog(null);
    go(pathFor("orderDetail", order.id));
  };
  const setInvoiceLine = (index, name, value) =>
    setDialog((current) => ({
      ...current,
      error: "",
      fields: {
        ...current.fields,
        lines: current.fields.lines.map((line, i) =>
          i === index ? { ...line, [name]: value } : line,
        ),
      },
    }));
  const addInvoiceLine = () =>
    setDialog((current) => ({
      ...current,
      fields: {
        ...current.fields,
        lines: [
          ...current.fields.lines,
          { id: uid(), search: "", cases: 1, casePrice: "", note: "" },
        ],
      },
    }));
  const deleteInvoiceLine = (index) =>
    setDialog((current) => ({
      ...current,
      fields: {
        ...current.fields,
        lines: current.fields.lines.filter((_, i) => i !== index),
      },
    }));
  const setOrderLine = (index, name, value) =>
    setDialog((current) => ({
      ...current,
      error: "",
      fields: {
        ...current.fields,
        lines: current.fields.lines.map((line, i) =>
          i === index ? { ...line, [name]: value } : line,
        ),
      },
    }));
  const addOrderLine = () =>
    setDialog((current) => ({
      ...current,
      fields: {
        ...current.fields,
        lines: [
          ...current.fields.lines,
          { id: uid(), search: "", cases: 1, casePrice: "" },
        ],
      },
    }));
  const deleteOrderLine = (index) =>
    setDialog((current) => ({
      ...current,
      fields: {
        ...current.fields,
        lines: current.fields.lines.filter((_, i) => i !== index),
      },
    }));
  const fail = (message) =>
    setDialog((current) => ({ ...current, error: message }));
  const save = (event) => {
    event.preventDefault();
    if (uploadingPicture) return fail("Attends la fin de l’envoi de la photo.");
    const { type, id, fields } = dialog;
    const action = event.nativeEvent?.submitter?.value || "save";
    let savedDocumentId = null;
    let receiveSeed = null;
    if (type === "family") {
      const family = {
        id: id || uid(),
        name: fields.name.trim(),
        category: fields.category.trim(),
      };
      if (!family.name || !family.category)
        return fail("Renseigne le nom et la catégorie.");
      if (
        data.families.some(
          (row) =>
            row.id !== id &&
            [row.name, row.category]
              .map((value) => value.toLocaleLowerCase("fr"))
              .join("|") ===
              [family.name, family.category]
                .map((value) => value.toLocaleLowerCase("fr"))
                .join("|"),
        )
      )
        return fail("Cette fiche produit existe déjà.");
      const updatedNames = catalog
        .filter((row) => row.familyId === id)
        .map((row) =>
          productName({
            ...row,
            brand: family.name,
            product: family.category,
            format: row.format,
          }).toLocaleLowerCase("fr"),
        );
      if (
        catalog.some(
          (row) =>
            row.familyId !== id &&
            updatedNames.includes(productName(row).toLocaleLowerCase("fr")),
        )
      )
        return fail(
          "Une variante porterait le même nom complet qu’un autre produit.",
        );
      setData((current) => ({
        ...current,
        families: id
          ? current.families.map((row) => (row.id === id ? family : row))
          : [...current.families, family],
      }));
      if (!id) go(pathFor("productDetail", family.id));
    } else if (type === "variant") {
      const family = data.families.find((row) => row.id === selectedFamilyId);
      if (!family)
        return fail("Ouvre une fiche produit avant d’ajouter une variante.");
      const variant = {
        code: fields.code.trim().toUpperCase(),
        familyId: family.id,
        variant: fields.variant.trim(),
        format: fields.format.trim(),
        unitsPerCase: Number(fields.unitsPerCase),
        margin: fields.margin === "" ? null : Number(fields.margin),
        picture: fields.picture || null,
        published: Boolean(fields.published),
      };
      if (!variant.code) variant.code = generateProductCode(family.category, data.products);
      if (!variant.format) return fail("Renseigne le volume de la variante.");
      if (!Number.isInteger(variant.unitsPerCase) || variant.unitsPerCase < 1)
        return fail("Les unités par caisse doivent être un entier positif.");
      if (
        variant.margin != null &&
        (!Number.isFinite(variant.margin) ||
          variant.margin < 0 ||
          variant.margin >= 100)
      )
        return fail("La marge doit être comprise entre 0 et moins de 100 %.");
      if (
        data.products.some(
          (row) => row.code === variant.code && row.code !== id,
        )
      )
        return fail("Ce code existe déjà.");
      const fullName = productName({
        brand: family.name,
        product: family.category,
        variant: variant.variant,
         format: variant.format,
      }).toLocaleLowerCase("fr");
      if (
        catalog.some(
          (row) =>
            row.code !== id &&
            productName(row).toLocaleLowerCase("fr") === fullName,
        )
      )
        return fail("Ce nom complet existe déjà.");
      setData((current) => ({
        ...current,
        products: id
          ? current.products.map((row) => (row.code === id ? variant : row))
          : [...current.products, variant],
      }));
    } else if (type === "supplier" || type === "customer") {
      const key = type === "supplier" ? "suppliers" : "customers";
      const contact = {
        id: id || uid(),
        name: fields.name.trim(),
        contact: (fields.contact || "").trim(),
        phone: (fields.phone || "").trim(),
        email: (fields.email || "").trim(),
        address: (fields.address || "").trim(),
        note: (fields.note || "").trim(),
      };
      if (!contact.name) return fail("Renseigne le nom.");
      if (
        data[key].some(
          (row) =>
            row.id !== id &&
            row.name.trim().toLocaleLowerCase("fr") ===
              contact.name.toLocaleLowerCase("fr"),
        )
      )
        return fail("Ce nom existe déjà.");
      setData((current) => ({
        ...current,
        [key]: id
          ? current[key].map((row) => (row.id === id ? contact : row))
          : [...current[key], contact],
      }));
    } else if (type === "purchaseOrder") {
      const number = fields.number.trim();
      const supplierId = fields.supplierId;
      const previous = data.purchaseOrders.find((row) => row.id === id);
      const hasReceipts = hasLinkedReceipts(id, data.invoices);
      const previousStage = previous?.stage || "draft";
      const nextStage = orderStageForAction(previousStage, action, hasReceipts);
      if (!nextStage)
        return fail("Cette transition de commande n’est pas autorisée.");
      if (
        !fields.date ||
        !number ||
        !data.suppliers.some((row) => row.id === supplierId)
      )
        return fail("Renseigne la date, le numéro et le fournisseur.");
      if (
        data.purchaseOrders.some(
          (row) =>
            row.id !== id &&
            row.number.trim().toLocaleLowerCase("fr") ===
              number.toLocaleLowerCase("fr"),
        )
      )
        return fail("Ce numéro de PO existe déjà.");
      if (!fields.lines.length) return fail("Ajoute au moins un produit.");
      const lines = [];
      const seen = new Set();
      for (const line of fields.lines) {
        const product = findProduct(catalog, line.search);
        if (!product)
          return fail(
            "Choisis un produit présent dans le catalogue pour chaque ligne.",
          );
        const cases = Number(line.cases);
        const casePrice = Number(line.casePrice);
        if (seen.has(product.code))
          return fail(
            "Regroupe les caisses d’une même variante sur une seule ligne.",
          );
        if (
          !Number.isInteger(cases) ||
          cases < 1 ||
          !Number.isFinite(casePrice) ||
          casePrice <= 0
        )
          return fail("Saisis des caisses entières et un prix prévu positif.");
        seen.add(product.code);
        lines.push({
          id: line.id || uid(),
          productCode: product.code,
          cases,
          casePrice,
        });
      }
      if (
        hasReceipts &&
        (supplierId !== previous.supplierId ||
          JSON.stringify(lines) !== JSON.stringify(previous.lines))
      )
        return fail(
          "Détache les factures avant de modifier les lignes, le fournisseur ou d’annuler ce PO.",
        );
      const order = {
        id: id || uid(),
        date: fields.date,
        number,
        supplierId,
        stage: nextStage,
        note: fields.note.trim(),
        lines,
      };
      savedDocumentId = order.id;
      if (action === "receive") {
        const derived = report.purchaseOrders.find((row) => row.id === id);
        const remaining = hasReceipts
          ? derived?.lines || []
          : lines.map((line) => ({ ...line, remainingCases: line.cases }));
        receiveSeed = {
          supplierId,
          purchaseOrderId: order.id,
          lines: remaining
            .filter((line) => line.remainingCases > 0)
            .map((line) => ({
              id: uid(),
              search: line.productCode,
              cases: line.remainingCases,
              casePrice: line.casePrice,
              note: "",
            })),
        };
        if (!receiveSeed.lines.length)
          return fail("Toutes les caisses de ce bon ont déjà été reçues.");
      }
      setData((current) => ({
        ...current,
        purchaseOrders: id
          ? current.purchaseOrders.map((row) => (row.id === id ? order : row))
          : [...current.purchaseOrders, order],
      }));
    } else if (type === "invoice") {
      const number = fields.number.trim();
      const selectedSupplier = data.suppliers.find(
        (row) => row.id === fields.supplierId,
      );
      const supplier = selectedSupplier?.name || fields.supplier?.trim() || "";
      if (!fields.date || (!id && (!number || !selectedSupplier)))
        return fail(
          "Renseigne la date, le fournisseur et le numéro de facture.",
        );
      if (!fields.lines.length)
        return fail("Ajoute au moins un produit à la facture.");
      if (
        number &&
        supplier &&
        data.invoices.some(
          (row) =>
            row.id !== id &&
            row.number.trim().toLocaleLowerCase("fr") ===
              number.toLocaleLowerCase("fr") &&
            (selectedSupplier
              ? row.supplierId === selectedSupplier.id
              : row.supplier?.trim().toLocaleLowerCase("fr") ===
                supplier.toLocaleLowerCase("fr")),
        )
      )
        return fail("Cette facture existe déjà pour ce fournisseur.");
      const purchaseOrderId = fields.purchaseOrderId || null;
      const linkedOrder = data.purchaseOrders.find(
        (row) => row.id === purchaseOrderId,
      );
      if (
        purchaseOrderId &&
        (!linkedOrder ||
          linkedOrder.supplierId !== fields.supplierId ||
          linkedOrder.stage !== "ordered")
      )
        return fail("Choisis un PO commandé appartenant à ce fournisseur.");
      const lines = [];
      for (const line of fields.lines) {
        const product = findProduct(catalog, line.search);
        if (!product)
          return fail(
            "Choisis un code ou un nom complet présent dans Produits pour chaque ligne.",
          );
        const cases = Number(line.cases);
        const casePrice = Number(line.casePrice);
        if (
          !Number.isInteger(cases) ||
          cases < 1 ||
          !Number.isFinite(casePrice) ||
          casePrice <= 0
        )
          return fail(
            "Chaque ligne doit avoir un nombre entier de caisses et un prix positif.",
          );
        lines.push({
          id: line.id || uid(),
          productCode: product.code,
          cases,
          casePrice,
          note: (line.note || "").trim(),
        });
      }
      const invoice = {
        id: id || uid(),
        date: fields.date,
        supplierId: selectedSupplier?.id || null,
        supplier,
        purchaseOrderId,
        number,
        note: fields.note.trim(),
        lines,
      };
      savedDocumentId = invoice.id;
      const nextInvoices = id
        ? data.invoices.map((row) => (row.id === id ? invoice : row))
        : [...data.invoices, invoice];
      if (breaksConfirmedSales(nextInvoices))
        return fail(
          "Cette modification laisserait une vente confirmée sans réception antérieure.",
        );
      setData((current) => ({ ...current, invoices: nextInvoices }));
    } else if (type === "sale") {
      const previousStatus = data.sales.find((row) => row.id === id)?.status || "En attente";
      const nextStatus = saleStatusForAction(previousStatus, action);
      if (!nextStatus) return fail("Cette transition de vente n’est pas autorisée.");
      if (!fields.date) return fail("La date est nécessaire.");
      if (!fields.number) return fail("Aucun numéro de vente disponible pour cette date.");
      if (!fields.lines.length) return fail("Ajoute au moins un produit.");
      const lines = fields.lines.map(line => ({ id: line.id || uid(), productCode: findProduct(catalog, line.search)?.code,
        quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) }));
      if (lines.some(line => !line.productCode || !Number.isInteger(line.quantity) || line.quantity < 1 ||
        !Number.isFinite(line.unitPrice) || line.unitPrice <= 0))
        return fail("Choisis un produit, une quantité entière et un prix réel positif pour chaque ligne.");
      if (new Set(lines.map(line => line.productCode)).size !== lines.length)
        return fail("Chaque produit doit apparaître une seule fois.");
      if (nextStatus === "Confirmée/Vendue" && lines.some(line => !report.receipts.some(
        row => row.productCode === line.productCode && row.date <= fields.date)))
        return fail(
          "Ajoute une réception datée au plus tard du jour de la vente pour chaque produit.",
        );
      if (data.sales.some(row => row.id !== id && row.number === fields.number))
        return fail("Ce numéro de vente existe déjà.");
      if (
        fields.customerId &&
        !data.customers.some((row) => row.id === fields.customerId)
      )
        return fail("Choisis un client existant.");
      const sale = {
        id: id || uid(),
        date: fields.date,
        number: fields.number,
        order: fields.order.trim(),
        customerId: fields.customerId || null,
        client: fields.client.trim(),
        lines,
        status: nextStatus,
        payment: fields.payment,
        note: fields.note.trim(),
      };
      setData((current) => ({
        ...current,
        sales: id
          ? current.sales.map((row) => (row.id === id ? sale : row))
          : [...current.sales, sale],
      }));
      savedDocumentId = sale.id;
    } else {
      const amount = Number(fields.amount);
      if (
        !fields.date ||
        !fields.description.trim() ||
        !Number.isFinite(amount) ||
        amount <= 0
      )
        return fail("Saisis une date, une description et un montant positif.");
      const expense = {
        id: id || uid(),
        date: fields.date,
        category: fields.category,
        description: fields.description.trim(),
        amount,
        paidBy: fields.paidBy.trim(),
        note: fields.note.trim(),
      };
      setData((current) => ({
        ...current,
        expenses: id
          ? current.expenses.map((row) => (row.id === id ? expense : row))
          : [...current.expenses, expense],
      }));
    }
    closeDrawer();
    if (savedDocumentId) {
      if (receiveSeed) open("invoice", null, receiveSeed);
      else {
        setDialog(null);
        go(
          pathFor(
            type === "purchaseOrder" ? "orderDetail" : type === "sale" ? "saleDetail" : "invoiceDetail",
            savedDocumentId,
          ),
        );
      }
    }
    setNotice("Enregistré sur cet appareil.");
  };
  const remove = (type, item) => {
    const familyCodes =
      type === "family"
        ? new Set(
            data.products
              .filter((row) => row.familyId === item.id)
              .map((row) => row.code),
          )
        : null;
    const usedCodes =
      type === "family"
        ? familyCodes
        : type === "variant"
          ? new Set([item.code])
          : null;
    if (
      usedCodes &&
      (report.receipts.some((row) => usedCodes.has(row.productCode)) ||
      data.sales.some((row) => saleLines(row).some(line => usedCodes.has(line.productCode))) ||
        data.purchaseOrders.some((order) =>
          order.lines.some((line) => usedCodes.has(line.productCode)),
        ))
    ) {
      setNotice(
        "Une variante possède des réceptions, des ventes ou des PO. Supprime ces opérations d’abord.",
      );
      return;
    }
    if (
      type === "supplier" &&
      (data.invoices.some((row) => row.supplierId === item.id) ||
        data.purchaseOrders.some((row) => row.supplierId === item.id))
    ) {
      setNotice("Ce fournisseur est lié à une facture ou un PO.");
      return;
    }
    if (
      type === "customer" &&
      data.sales.some((row) => row.customerId === item.id)
    ) {
      setNotice("Ce client est lié à une vente.");
      return;
    }
    if (
      type === "purchaseOrder" &&
      data.invoices.some((row) => row.purchaseOrderId === item.id)
    ) {
      setNotice("Détache les factures avant de supprimer ce PO.");
      return;
    }
    if (
      type === "invoice" &&
      breaksConfirmedSales(data.invoices.filter((row) => row.id !== item.id))
    ) {
      setNotice(
        "Cette réception est nécessaire au calcul d’une vente confirmée.",
      );
      return;
    }
    if (!window.confirm("Supprimer cet élément ?")) return;
    if (type === "family") {
      setData((current) => ({
        ...current,
        families: current.families.filter((row) => row.id !== item.id),
        products: current.products.filter((row) => row.familyId !== item.id),
      }));
      navigate("products");
    } else {
      const key = {
        variant: "products",
        supplier: "suppliers",
        customer: "customers",
        purchaseOrder: "purchaseOrders",
        invoice: "invoices",
        sale: "sales",
        expense: "expenses",
      }[type];
      setData((current) => ({
        ...current,
        [key]: current[key].filter((row) =>
          type === "variant" ? row.code !== item.code : row.id !== item.id,
        ),
      }));
    }
    if (
      (type === "supplier" || type === "customer") &&
      selectedContactId === item.id
    ) {
      if (page === "supplierDetail" || page === "customerDetail")
        navigate(type === "supplier" ? "suppliers" : "customers");
    }
    closeDrawer();
    setNotice("Élément supprimé.");
    return true;
  };
  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
    } else {
      setNotice(
        "Sur iPhone : Partager → Sur l’écran d’accueil. Sur Android : menu du navigateur → Installer l’application.",
      );
    }
  };
  const backup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ks-sauvegarde-${today()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const restore = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const restored = normalizeState(parsed);
      if (!restored) throw new Error("Format de sauvegarde incorrect.");
      if (
        !window.confirm(
          "Remplacer les données communes de tous les appareils par cette sauvegarde ?",
        )
      )
        return;
      await importBackup(restored);
      setSyncError("");
      setNotice("Sauvegarde restaurée dans D1.");
    } catch (error) {
      setSyncError(error.message);
      setNotice(error.message);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <DrawerContext.Provider value={{ drawer, closeDrawer, showTableDrawer }}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              KS
            </span>
            <div>Gestion commerciale</div>
          </div>
          <nav aria-label="Navigation principale">
            {navItems.map(([key, label, Icon]) => (
              <AppLink
                key={key}
                to={pathFor(key)}
                className={
                  page === key ||
                  (key === "products" && page === "productDetail") ||
                  (key === "suppliers" && page === "supplierDetail") ||
                  (key === "customers" && page === "customerDetail") ||
                  (key === "purchaseOrders" &&
                    (page === "orderDetail" || page === "orderEditor")) ||
                  (key === "receipts" &&
                    (page === "invoiceDetail" || page === "invoiceEditor"))
                    ? "active"
                    : ""
                }
              >
                <Icon size={18} />
                <span>{label}</span>
              </AppLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <span className="status-dot" />{" "}
            {syncStatus === "online"
              ? "Données synchronisées"
              : syncStatus === "offline"
                ? `Hors connexion · ${pendingCount} en attente`
                : "Connexion à D1"}
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <div>
              <h1>{pageTitle}</h1>
            </div>
            <button className="install-button" onClick={install}>
              <Smartphone size={17} /> Installer
            </button>
          </header>
          <nav className="mobile-nav" aria-label="Navigation mobile">
            {navItems.map(([key, label, Icon]) => (
              <AppLink
                key={key}
                to={pathFor(key)}
                className={
                  page === key ||
                  (key === "products" && page === "productDetail") ||
                  (key === "suppliers" && page === "supplierDetail") ||
                  (key === "customers" && page === "customerDetail") ||
                  (key === "purchaseOrders" &&
                    (page === "orderDetail" || page === "orderEditor")) ||
                  (key === "receipts" &&
                    (page === "invoiceDetail" || page === "invoiceEditor"))
                    ? "active"
                    : ""
                }
              >
                <Icon size={17} />
                <span>{label}</span>
              </AppLink>
            ))}
          </nav>
          <div className="workspace" ref={workspaceRef}>
            <div className={`content${editingDocument ? " content-document-editor" : ""}`}>
              {(syncStatus === "offline" || pendingCount > 0) && (
                <div className="sync-banner" role="status">
                  {syncStatus === "offline"
                    ? "Hors connexion. Les modifications restent sur cet appareil."
                    : "Synchronisation en cours."}{" "}
                  {pendingCount > 0 &&
                    `${pendingCount} modification(s) en attente.`}
                </div>
              )}
              {page === "notFound" && (
                <section className="panel">
                  <Empty text="Cette page est introuvable." />
                  <AppLink className="secondary" to="/">
                    Retour à l’accueil
                  </AppLink>
                </section>
              )}
              {editingDocument &&
                (page === "saleEditor" ? (dialog?.editorPath === pathFor(page, route.id) ?
                  <SaleEditor fields={dialog.fields} error={dialog.error} catalog={catalog} customers={data.customers}
                    onField={setField} onLine={setSaleLine} onDeleteLine={deleteSaleLine} onAddProduct={addSaleProduct}
                    onCreateProduct={createDocumentProduct} onCreateCustomer={createSaleCustomer} onSave={save}
                    onCancel={() => { setDialog(null); backTo("sales"); }} /> :
                  <section className="panel"><Empty text="Cette vente est introuvable." /></section>) :
                dialog?.editorPath === pathFor(page, route.id) ? (
                  <DocumentEditor
                    type={dialog.type}
                    fields={dialog.fields}
                    error={dialog.error}
                    isEditing={Boolean(dialog.id)}
                    suppliers={data.suppliers}
                    orders={report.purchaseOrders}
                    catalog={catalog}
                    onField={setField}
                    onSupplier={selectInvoiceSupplier}
                    onOrder={selectInvoiceOrder}
                    onLine={
                      dialog.type === "invoice" ? setInvoiceLine : setOrderLine
                    }
                    onDeleteLine={
                      dialog.type === "invoice"
                        ? deleteInvoiceLine
                        : deleteOrderLine
                    }
                    onAddProduct={addDocumentProduct}
                    onCreateSupplier={createDocumentSupplier}
                    onCreateProduct={createDocumentProduct}
                    onCancelOrder={cancelDocumentOrder}
                    onSave={save}
                    onCancel={() => {
                      setDialog(null);
                      backTo(
                        page === "orderEditor" ? "purchaseOrders" : "receipts",
                      );
                    }}
                  />
                ) : route.id &&
                  !(
                    page === "orderEditor" ? data.purchaseOrders : data.invoices
                  ).some((row) => row.id === route.id) ? (
                  <section className="panel">
                    <Empty text="Ce document est introuvable." />
                    <button
                      className="secondary"
                      onClick={() =>
                        navigate(
                          page === "orderEditor"
                            ? "purchaseOrders"
                            : "receipts",
                        )
                      }
                    >
                      Retour à la liste
                    </button>
                  </section>
                ) : null)}
              {page === "overview" && (
                <>
                  <div className="intro">
                    <div>
                      <span className="eyebrow">ACTIVITÉ EN TEMPS RÉEL</span>
                      <h2>Votre commerce, en un coup d’œil.</h2>
                      <p>
                        Les ventes confirmées mettent à jour les chiffres et le
                        stock automatiquement.
                      </p>
                    </div>
                    <button className="primary" onClick={() => open("sale")}>
                      <Plus size={18} /> Nouvelle vente
                    </button>
                  </div>
                  <div className="hero">
                    <div>
                      <span>Résultat estimé après dépenses</span>
                      <strong>{money(report.totals.net)}</strong>
                      <small>
                          {report.totals.confirmedCount} vente
                        {report.totals.confirmedCount > 1 ? "s" : ""} confirmée
                        {report.totals.confirmedCount > 1 ? "s" : ""}
                      </small>
                    </div>
                    <TrendingUp size={76} strokeWidth={1} />
                  </div>
                  <div className="metrics">
                    <Metric
                      icon={<Wallet />}
                      label="Chiffre d’affaires"
                      value={money(report.totals.revenue)}
                      detail="Ventes confirmées"
                    />
                    <Metric
                      icon={<TrendingUp />}
                      label="Bénéfice brut"
                      value={money(report.totals.grossProfit)}
                      detail={`Marge réelle : ${percent(report.totals.margin)}`}
                    />
                    <Metric
                      icon={<Receipt />}
                      label="Dépenses"
                      value={money(report.totals.expenses)}
                      detail="Frais saisis"
                    />
                    <Metric
                      icon={<Boxes />}
                      label="Unités en stock"
                      value={report.totals.stock}
                      detail={`${report.totals.unitsSold} vendues`}
                    />
                  </div>
                  <div className="two-col">
                    <section className="panel">
                      <div className="panel-head">
                        <h3>Dernières ventes</h3>
                        <button
                          className="text-button"
                          onClick={() => navigate("sales")}
                        >
                          Voir tout <ArrowUpRight size={15} />
                        </button>
                      </div>
                      {report.sales.length ? (
                        [...report.sales]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .slice(0, 5)
                          .map((s) => (
                            <div className="compact-row" key={s.id}>
                              <div>
                                <strong><AppLink className="product-link" to={pathFor("saleDetail", s.id)}>{s.number} · {s.lines.length} produit(s)</AppLink></strong>
                                <small>
                                  {s.date} · {saleStatusLabel(s.status)}
                                </small>
                              </div>
                              <b>{money(s.revenue)}</b>
                            </div>
                          ))
                      ) : (
                        <Empty text="Aucune vente pour le moment." />
                      )}
                    </section>
                    <section className="panel">
                      <div className="panel-head">
                        <h3>Stock à surveiller</h3>
                        <button
                          className="text-button"
                          onClick={() => navigate("stock")}
                        >
                          Voir le stock <ArrowUpRight size={15} />
                        </button>
                      </div>
                      {[...report.products]
                        .sort((a, b) => a.stock - b.stock)
                        .slice(0, 5)
                        .map((p) => (
                          <div className="compact-row" key={p.code}>
                            <div>
                              <strong>{p.shortName}</strong>
                              <small>
                                {p.format} · {p.code}
                              </small>
                            </div>
                            <b className={p.stock <= 0 ? "danger" : ""}>
                              {p.stock} unités
                            </b>
                          </div>
                        ))}
                    </section>
                  </div>
                </>
              )}
              {page === "products" && (
                <section className="panel">
                  <div className="panel-head wrap">
                    <div>
                      <h2>Catalogue de produits</h2>
                      <p>{productTab === "publication"
                        ? `${report.products.filter((product) => product.published).length} variante(s) publiées sur ${report.products.length}.`
                        : "Une fiche rassemble les variantes et volumes d’un même produit."}</p>
                    </div>
                    {productTab === "families" ? <button className="primary" onClick={() => open("family")}>
                      <Plus size={17} /> Nouvelle fiche
                    </button> : <a className="secondary" href="/" target="_blank" rel="noreferrer">Voir la vitrine <ArrowUpRight size={16}/></a>}
                  </div>
                  <div className="product-tabs" role="group" aria-label="Vue du catalogue de produits">
                    <button type="button" aria-pressed={productTab === "families"} className={productTab === "families" ? "active" : ""} onClick={() => setProductTab("families")}>Fiches produit</button>
                    <button type="button" aria-pressed={productTab === "publication"} className={productTab === "publication" ? "active" : ""} onClick={() => setProductTab("publication")}>Publication</button>
                  </div>
                  {productTab === "families" ? (
                  <DataTable
                    kind="produits"
                    data={report.families}
                    emptyText="Aucun produit trouvé."
                    columns={[
                      {
                        accessorKey: "name",
                        header: "Nom",
                        cell: ({ row }) => (
                          <AppLink
                            className="product-link"
                            to={pathFor("productDetail", row.original.id)}
                          >
                            {row.original.name}
                          </AppLink>
                        ),
                      },
                      { accessorKey: "category", header: "Catégorie" },
                      { accessorKey: "variantCount", header: "Variantes" },
                      { id: "publishedCount", header: "Publiées", accessorFn: (family) => family.variants.filter((variant) => variant.published).length,
                        cell: ({ row }) => `${row.original.variants.filter((variant) => variant.published).length}/${row.original.variantCount}` },
                      { accessorKey: "stock", header: "Stock total" },
                      {
                        id: "actions",
                        header: "",
                        enableSorting: false,
                        enableColumnFilter: false,
                        cell: ({ row }) => (
                          <AppLink
                            className="icon-button"
                            aria-label={`Ouvrir ${row.original.name}`}
                            to={pathFor("productDetail", row.original.id)}
                          >
                            <ArrowUpRight size={16} />
                          </AppLink>
                        ),
                      },
                    ]}
                  />) : (
                    <DataTable
                      kind="catalogVariants"
                      data={report.products}
                      emptyText="Aucune variante trouvée."
                      selectionActions={(selected, clearSelection) => {
                        const toPublish = selected.filter((product) => !product.published);
                        const toRemove = selected.filter((product) => product.published);
                        return <>
                          <button type="button" className="primary" disabled={!toPublish.length} onClick={() => { setPublished(toPublish.map((product) => product.code), true); clearSelection(); setNotice(`${toPublish.length} variante(s) publiée(s) sur la vitrine.`) }}>Publier ({toPublish.length})</button>
                          <button type="button" className="secondary" disabled={!toRemove.length} onClick={() => { setPublished(toRemove.map((product) => product.code), false); clearSelection(); setNotice(`${toRemove.length} variante(s) retirée(s) de la vitrine.`) }}>Retirer de la vitrine ({toRemove.length})</button>
                        </>;
                      }}
                      columns={[
                        { accessorKey: "brand", header: "Produit", cell: ({ row }) => <><AppLink className="product-link" to={pathFor("productDetail", row.original.familyId)}>{row.original.brand}</AppLink><small>{row.original.code}</small></> },
                        { accessorKey: "product", header: "Catégorie" },
                        { accessorKey: "variant", header: "Variante", cell: (info) => info.getValue() || "Sans variante" },
                        { accessorKey: "format", header: "Volume" },
                        { id: "publicationStatus", accessorFn: (product) => product.published ? "Publié" : "Non publié", header: "Vitrine",
                          cell: (info) => <span className={info.row.original.published ? "publish-status is-published" : "publish-status"}>{info.getValue()}</span> },
                        { id: "actions", header: "", enableSorting: false, enableColumnFilter: false,
                          cell: ({ row }) => <button type="button" className={row.original.published ? "secondary publish-action" : "primary publish-action"} onClick={() => setPublished([row.original.code], !row.original.published)}>{row.original.published ? "Retirer" : "Publier"}</button> },
                      ]}
                    />
                  )}
                </section>
              )}
              {page === "productDetail" &&
                (selectedFamily ? (
                  <div className="product-detail">
                    <button
                      className="text-button product-back"
                      onClick={() => backTo("products")}
                    >
                      ← Retour aux produits
                    </button>
                    <section className="panel product-summary">
                      <div className="panel-head wrap">
                        <div>
                          <span className="eyebrow">FICHE PRODUIT</span>
                          <h2>
                            {selectedFamily.name}
                          </h2>
                          <p>
                            {selectedFamily.variantCount} variante
                            {selectedFamily.variantCount > 1 ? "s" : ""} ·{" "}
                            {selectedFamily.stock} unités en stock
                          </p>
                        </div>
                        <div className="entry-actions">
                          <button
                            className="secondary"
                            onClick={() => open("family", selectedFamily)}
                          >
                            <Pencil size={16} /> Modifier
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label="Supprimer la fiche produit"
                            onClick={() => remove("family", selectedFamily)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="product-facts">
                        <div>
                          <span>Nom</span>
                          <strong>{selectedFamily.name}</strong>
                        </div>
                        <div>
                          <span>Catégorie</span>
                          <strong>{selectedFamily.category}</strong>
                        </div>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-head wrap">
                        <div>
                          <h2>Variantes</h2>
                          <p>
                            Coûts moyens et prix conseillés calculés séparément
                            pour chaque code.
                          </p>
                        </div>
                        <button
                          className="primary"
                          onClick={() => open("variant")}
                        >
                          <Plus size={17} /> Ajouter une variante
                        </button>
                      </div>
                      <DataTable
                        kind="variantes"
                        data={selectedFamily.variants}
                        emptyText="Aucune variante. Ajoute le premier code produit."
                        columns={[
                          {
                            accessorKey: "variant",
                            header: "Variante",
                            cell: ({ row }) => (
                              <>
                                <strong>
                                  {row.original.variant || "Sans variante"}
                                </strong>
                                <small>{row.original.code}</small>
                              </>
                            ),
                          },
                          { accessorKey: "code", header: "Code" },
                          { accessorKey: "format", header: "Volume" },
                          {
                            accessorKey: "unitsPerCase",
                            header: "Unités/caisse",
                          },
                          {
                            accessorKey: "casePrice",
                            header: "Coût moyen/caisse",
                            cell: (info) => money(info.getValue()),
                          },
                          {
                            accessorKey: "cogAvgPrice",
                            header: "Coût moyen/unité",
                            cell: (info) => money(info.getValue()),
                          },
                          {
                            accessorKey: "targetMargin",
                            header: "Marge cible",
                            cell: (info) => percent(info.getValue()),
                          },
                          {
                            accessorKey: "suggestedPrice",
                            header: "Prix conseillé",
                            cell: (info) => <b>{money(info.getValue())}</b>,
                          },
                          {
                            accessorKey: "stock",
                            header: "Stock",
                            cell: (info) => (
                              <span
                                className={
                                  info.getValue() <= 0
                                    ? "stock-warning"
                                    : "stock-good"
                                }
                              >
                                {info.getValue()}
                              </span>
                            ),
                          },
                          {
                            id: "publicationStatus",
                            accessorFn: (product) => product.published ? "Publié" : "Non publié",
                            header: "Vitrine",
                            cell: (info) => <span className={info.row.original.published ? "publish-status is-published" : "publish-status"}>{info.getValue()}</span>,
                          },
                          {
                            id: "actions",
                            header: "",
                            enableSorting: false,
                            enableColumnFilter: false,
                            cell: ({ row }) => (
                              <div className="entry-actions">
                                <button type="button" className={row.original.published ? "secondary publish-action" : "primary publish-action"} onClick={() => setPublished([row.original.code], !row.original.published)}>{row.original.published ? "Retirer" : "Publier"}</button>
                                <button
                                  className="icon-button"
                                  aria-label={`Modifier ${row.original.variant || row.original.code}`}
                                  onClick={() => open("variant", row.original)}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  className="icon-button danger"
                                  aria-label={`Supprimer ${row.original.variant || row.original.code}`}
                                  onClick={() =>
                                    remove("variant", row.original)
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ),
                          },
                        ]}
                      />
                    </section>
                  </div>
                ) : (
                  <section className="panel">
                    <Empty text="Cette fiche produit est introuvable." />
                    <button
                      className="secondary"
                      onClick={() => navigate("products")}
                    >
                      Retour aux produits
                    </button>
                  </section>
                ))}
              {page === "invoiceDetail" &&
                (selectedInvoice ? (
                  <InvoiceDetail
                    invoice={selectedInvoice}
                    canShare={syncStatus === "online" && pendingCount === 0}
                    order={report.purchaseOrders.find(
                      (order) => order.id === selectedInvoice.purchaseOrderId,
                    )}
                    supplier={data.suppliers.find(
                      (supplier) => supplier.id === selectedInvoice.supplierId,
                    )}
                    onBack={backFromDocument}
                    onEdit={() => open("invoice", selectedInvoice)}
                    onPrint={() => setPrintInvoiceId(selectedInvoice.id)}
                  />
                ) : (
                  <section className="panel">
                    <Empty text="Cette facture est introuvable." />
                    <button className="secondary" onClick={backFromDocument}>
                      Retour
                    </button>
                  </section>
                ))}
              {page === "saleDetail" && (selectedSale ?
                <SaleDetail sale={selectedSale} canShare={syncStatus === "online" && pendingCount === 0}
                  onBack={backFromDocument} onEdit={() => open("sale", selectedSale)}
                  onPrint={() => setPrintSaleId(selectedSale.id)}
                  onDelete={() => { if (remove("sale", selectedSale)) go(pathFor("sales")); }} /> :
                <section className="panel"><Empty text="Cette vente est introuvable." /></section>)}
              {page === "orderDetail" &&
                (selectedOrder ? (
                  <OrderDetail
                    order={selectedOrder}
                    canShare={syncStatus === "online" && pendingCount === 0}
                    onBack={backFromDocument}
                    onEdit={() => open("purchaseOrder", selectedOrder)}
                    onPrint={() => setPrintOrderId(selectedOrder.id)}
                    onNewInvoice={() =>
                      open("invoice", null, {
                        supplierId: selectedOrder.supplierId,
                        purchaseOrderId: selectedOrder.id,
                        lines: selectedOrder.lines
                          .filter((line) => line.remainingCases > 0)
                          .map((line) => ({
                            id: uid(),
                            search: line.productCode,
                            cases: line.remainingCases,
                            casePrice: line.casePrice,
                            note: "",
                          })),
                      })
                    }
                  />
                ) : (
                  <section className="panel">
                    <Empty text="Ce PO est introuvable." />
                    <button className="secondary" onClick={backFromDocument}>
                      Retour
                    </button>
                  </section>
                ))}
              {(page === "supplierDetail" || page === "customerDetail") &&
                (selectedContact ? (
                  <ContactDetail
                    key={`${page}-${selectedContact.id}`}
                    type={page === "supplierDetail" ? "supplier" : "customer"}
                    contact={selectedContact}
                    invoices={report.invoices.filter(
                      (invoice) => invoice.supplierId === selectedContact.id,
                    )}
                    orders={report.purchaseOrders.filter(
                      (order) => order.supplierId === selectedContact.id,
                    )}
                    sales={report.sales.filter(
                      (sale) => sale.customerId === selectedContact.id,
                    )}
                    returnLabel={
                      navItems.find(
                        ([key]) => key === (previousPage || contactReturnPage),
                      )?.[1] ||
                      { orderDetail: "ce PO", invoiceDetail: "cette facture" }[
                        previousPage
                      ] ||
                      (page === "supplierDetail" ? "Fournisseurs" : "Clients")
                    }
                    activeSupplierTab={
                      new URLSearchParams(window.location.search).get("tab") ===
                      "orders"
                        ? "orders"
                        : "invoices"
                    }
                    onSupplierTabChange={(tab) => {
                      replaceQuery((params) => {
                        if (tab === "orders") params.set("tab", "orders");
                        else params.delete("tab");
                      });
                      setRouteVersion((value) => value + 1);
                    }}
                    onBack={backFromContact}
                    onEdit={() =>
                      open(
                        page === "supplierDetail" ? "supplier" : "customer",
                        selectedContact,
                      )
                    }
                    onDelete={() =>
                      remove(
                        page === "supplierDetail" ? "supplier" : "customer",
                        selectedContact,
                      )
                    }
                    onNewInvoice={() =>
                      open("invoice", null, { supplierId: selectedContact.id })
                    }
                    onNewOrder={() =>
                      open("purchaseOrder", null, {
                        supplierId: selectedContact.id,
                      })
                    }
                    onNewSale={() =>
                      open("sale", null, { customerId: selectedContact.id })
                    }
                    onEditInvoice={(invoice) => open("invoice", invoice)}
                    onEditOrder={(order) => open("purchaseOrder", order)}
                    onEditSale={(sale) => open("sale", sale)}
                  />
                ) : (
                  <section className="panel">
                    <Empty text="Cette fiche est introuvable." />
                    <button className="secondary" onClick={backFromContact}>
                      Retour à la liste
                    </button>
                  </section>
                ))}
              {(page === "suppliers" || page === "customers") && (
                <section className="panel">
                  <div className="panel-head wrap">
                    <div>
                      <h2>
                        {page === "suppliers" ? "Fournisseurs" : "Clients"}
                      </h2>
                      <p>Coordonnées et historique des opérations liées.</p>
                    </div>
                    <button
                      className="primary"
                      onClick={() =>
                        open(page === "suppliers" ? "supplier" : "customer")
                      }
                    >
                      <Plus size={17} />{" "}
                      {page === "suppliers" ? "Fournisseur" : "Client"}
                    </button>
                  </div>
                  <DataTable
                    kind={page === "suppliers" ? "fournisseurs" : "clients"}
                    data={(page === "suppliers"
                      ? data.suppliers
                      : data.customers
                    ).map((row) => ({
                      ...row,
                      operationCount:
                        page === "suppliers"
                          ? report.invoices.filter(
                              (invoice) => invoice.supplierId === row.id,
                            ).length
                          : report.sales.filter(
                              (sale) => sale.customerId === row.id,
                            ).length,
                    }))}
                    emptyText="Aucune fiche enregistrée."
                    columns={[
                      {
                        accessorKey: "name",
                        header: "Nom",
                        cell: ({ row }) => (
                          <AppLink
                            className="product-link"
                            to={pathFor(
                              page === "suppliers"
                                ? "supplierDetail"
                                : "customerDetail",
                              row.original.id,
                            )}
                          >
                            {row.original.name}
                          </AppLink>
                        ),
                      },
                      { accessorKey: "contact", header: "Contact principal" },
                      { accessorKey: "phone", header: "Téléphone" },
                      { accessorKey: "email", header: "Email" },
                      {
                        accessorKey: "operationCount",
                        header: page === "suppliers" ? "Factures" : "Ventes",
                      },
                      {
                        id: "actions",
                        header: "",
                        enableSorting: false,
                        enableColumnFilter: false,
                        cell: ({ row }) => (
                          <div className="entry-actions">
                            <button
                              className="icon-button"
                              aria-label={`Ouvrir la fiche de ${row.original.name}`}
                              onClick={() =>
                                openContactDetail(
                                  page === "suppliers"
                                    ? "supplier"
                                    : "customer",
                                  row.original.id,
                                )
                              }
                            >
                              <ArrowUpRight size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label="Modifier la fiche"
                              onClick={() =>
                                open(
                                  page === "suppliers"
                                    ? "supplier"
                                    : "customer",
                                  row.original,
                                )
                              }
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label="Supprimer la fiche"
                              onClick={() =>
                                remove(
                                  page === "suppliers"
                                    ? "supplier"
                                    : "customer",
                                  row.original,
                                )
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ),
                      },
                    ]}
                  />
                </section>
              )}
              {page === "purchaseOrders" && (
                <section className="panel document-list-panel">
                  <div className="panel-head wrap">
                    <div>
                      <h2>Bons de commande fournisseur</h2>
                      <p>
                        Prévisions, réceptions partielles et écarts avec les
                        factures.
                      </p>
                    </div>
                    <button
                      className="primary"
                      onClick={() => open("purchaseOrder")}
                    >
                      <Plus size={17} /> Nouveau PO
                    </button>
                  </div>
                  <DataTable
                    kind="commandes"
                    data={report.purchaseOrders}
                    initialSort={[{ id: "date", desc: true }]}
                    emptyText="Aucun bon de commande."
                    columns={[
                      {
                        accessorKey: "number",
                        header: "N° PO",
                        cell: ({ row }) => (
                          <AppLink
                            className="product-link"
                            to={pathFor("orderDetail", row.original.id)}
                          >
                            {row.original.number}
                          </AppLink>
                        ),
                      },
                      {
                        accessorFn: (order) => order.supplier?.name || "",
                        id: "supplierName",
                        header: "Fournisseur",
                        cell: ({ row }) =>
                          row.original.supplier ? (
                            <AppLink
                              className="product-link"
                              to={pathFor(
                                "supplierDetail",
                                row.original.supplierId,
                              )}
                            >
                              {row.original.supplier.name}
                            </AppLink>
                          ) : (
                            "Non précisé"
                          ),
                      },
                      { accessorKey: "date", header: "Date" },
                      { accessorKey: "status", header: "Statut" },
                      {
                        accessorKey: "plannedTotal",
                        header: "Prévu",
                        cell: (info) => money(info.getValue()),
                      },
                      {
                        accessorKey: "receivedTotal",
                        header: "Reçu",
                        cell: (info) => money(info.getValue()),
                      },
                      {
                        accessorFn: (order) =>
                          order.hasVariance ? "Écart" : "",
                        id: "variance",
                        header: "Écart",
                      },
                      {
                        id: "actions",
                        header: "",
                        enableSorting: false,
                        enableColumnFilter: false,
                        cell: ({ row }) => (
                          <div className="entry-actions">
                            <button
                              className="icon-button"
                              aria-label="Imprimer le PO"
                              onClick={() => setPrintOrderId(row.original.id)}
                            >
                              <Printer size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label="Modifier le PO"
                              onClick={() =>
                                open("purchaseOrder", row.original)
                              }
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label="Supprimer le PO"
                              onClick={() =>
                                remove("purchaseOrder", row.original)
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ),
                      },
                    ]}
                  />
                </section>
              )}
              {page === "receipts" && (
                <section className="panel document-list-panel">
                  <div className="panel-head wrap">
                    <div>
                      <h2>Réceptions par facture</h2>
                      <p>
                        Ouvre une facture pour voir ses produits. Le total est
                        calculé à partir des lignes.
                      </p>
                    </div>
                    <button className="primary" onClick={() => open("invoice")}>
                      <Plus size={17} /> Nouvelle facture
                    </button>
                  </div>
                  <DataTable
                    kind="receptions"
                    data={report.invoices}
                    initialSort={[{ id: "date", desc: true }]}
                    emptyText="Aucune réception enregistrée."
                    columns={[
                      {
                        accessorKey: "number",
                        header: "N° facture",
                        cell: ({ row }) => (
                          <AppLink
                            className="product-link"
                            to={pathFor("invoiceDetail", row.original.id)}
                          >
                            {row.original.number || "Sans numéro"}
                          </AppLink>
                        ),
                      },
                      {
                        accessorKey: "supplier",
                        header: "Fournisseur",
                        cell: ({ row }) =>
                          row.original.supplierId &&
                          data.suppliers.some(
                            (supplier) =>
                              supplier.id === row.original.supplierId,
                          ) ? (
                            <AppLink
                              className="product-link"
                              to={pathFor(
                                "supplierDetail",
                                row.original.supplierId,
                              )}
                            >
                              {row.original.supplier}
                            </AppLink>
                          ) : (
                            row.original.supplier || "Non précisé"
                          ),
                      },
                      {
                        accessorFn: (invoice) =>
                          report.purchaseOrders.find(
                            (order) => order.id === invoice.purchaseOrderId,
                          )?.number || "",
                        id: "purchaseOrderNumber",
                        header: "PO",
                        cell: ({ row }) =>
                          row.original.purchaseOrderId &&
                          report.purchaseOrders.some(
                            (order) =>
                              order.id === row.original.purchaseOrderId,
                          ) ? (
                            <AppLink
                              className="product-link"
                              to={pathFor(
                                "orderDetail",
                                row.original.purchaseOrderId,
                              )}
                            >
                              {row.getValue("purchaseOrderNumber")}
                            </AppLink>
                          ) : (
                            "—"
                          ),
                      },
                      { accessorKey: "date", header: "Date de réception" },
                      {
                        accessorKey: "total",
                        header: "Total",
                        cell: (info) => <b>{money(info.getValue())}</b>,
                      },
                      {
                        accessorFn: (invoice) => invoice.lines.length,
                        id: "lineCount",
                        header: "Produits",
                      },
                      {
                        id: "actions",
                        header: "",
                        enableSorting: false,
                        enableColumnFilter: false,
                        cell: ({ row }) => (
                          <div className="entry-actions">
                            <button
                              className="icon-button"
                              aria-label="Imprimer la réception"
                              onClick={() => setPrintInvoiceId(row.original.id)}
                            >
                              <Printer size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label="Modifier la facture"
                              onClick={() => open("invoice", row.original)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label="Supprimer la facture"
                              onClick={() => remove("invoice", row.original)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ),
                      },
                    ]}
                  />
                </section>
              )}
              {page === "sales" && (
                <section className="panel document-list-panel">
                  <div className="panel-head wrap">
                    <div>
                      <h2>Ventes</h2>
                      <p>
                        Le prix réel et le coût moyen à la date déterminent la
                        marge réelle.
                      </p>
                    </div>
                    <button className="primary" onClick={() => open("sale")}>
                      <Plus size={17} /> Vente
                    </button>
                  </div>
                  <DataTable
                    kind="ventes"
                    data={report.sales}
                    initialSort={[{ id: "date", desc: true }]}
                    emptyText="Aucune vente enregistrée."
                    columns={[
                      { accessorKey: "date", header: "Date" },
                      {
                         accessorFn: (s) => s.lines.map(line => line.product ? productName(line.product) : line.productCode).join(", "),
                        id: "productName",
                        header: "Produit",
                        cell: ({ row }) => (
                          <>
                            <strong>{row.getValue("productName")}</strong>
                            <small>
                               {row.original.number} · {row.original.order ||
                                row.original.client ||
                                row.original.productCode}
                            </small>
                          </>
                        ),
                      },
                      {
                        accessorKey: "customerName",
                        header: "Client",
                        cell: ({ row }) =>
                          row.original.customerId &&
                          data.customers.some(
                            (customer) =>
                              customer.id === row.original.customerId,
                          ) ? (
                            <AppLink
                              className="product-link"
                              to={pathFor(
                                "customerDetail",
                                row.original.customerId,
                              )}
                            >
                              {row.original.customerName}
                            </AppLink>
                          ) : (
                            row.original.client || "Vente anonyme"
                          ),
                      },
                       { accessorKey: "quantity", header: "Unités" },
                      {
                        accessorKey: "revenue",
                        header: "Total",
                        cell: (info) => money(info.getValue()),
                      },
                      {
                        accessorKey: "profit",
                        header: "Bénéfice",
                        cell: (info) =>
                          info.row.original.validCost
                            ? money(info.getValue())
                            : "Coût indisponible",
                      },
                      {
                        accessorKey: "margin",
                        header: "Marge réelle",
                        cell: (info) =>
                          info.row.original.validCost
                            ? percent(info.getValue())
                            : "—",
                      },
                      {
                        accessorKey: "status",
                        header: "Statut",
                        cell: ({ row }) => <span className="sale-status-badge">{saleStatusLabel(row.original.status)}</span>,
                      },
                      {
                        id: "actions",
                        header: "",
                        enableSorting: false,
                        enableColumnFilter: false,
                        cell: ({ row }) => (
                          <div className="entry-actions">
                            <AppLink className="icon-button" aria-label="Voir la vente" to={pathFor("saleDetail", row.original.id)}><Eye size={16} /></AppLink>
                            <button
                              className="icon-button"
                              aria-label="Modifier la vente"
                              onClick={() => open("sale", row.original)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label="Supprimer la vente"
                              onClick={() => remove("sale", row.original)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ),
                      },
                    ]}
                  />
                </section>
              )}
              {page === "stock" && (
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>État du stock</h2>
                      <p>
                        Réceptions moins ventes confirmées, avec bénéfice
                        réalisé par produit.
                      </p>
                    </div>
                  </div>
                  <DataTable
                    kind="stock"
                    data={report.products}
                    emptyText="Aucun produit."
                    columns={[
                      {
                        accessorKey: "name",
                        header: "Produit",
                        cell: ({ row }) => (
                          <>
                            <strong>{row.original.shortName}</strong>
                            <small>
                              {row.original.format} · {row.original.code}
                            </small>
                          </>
                        ),
                      },
                      {
                        accessorKey: "suggestedPrice",
                        header: "Prix conseillé",
                        cell: (info) => money(info.getValue()),
                      },
                      { accessorKey: "unitsReceived", header: "Reçues" },
                      { accessorKey: "sold", header: "Vendues" },
                      {
                        accessorKey: "stock",
                        header: "Restant",
                        cell: (info) => (
                          <span
                            className={
                              info.getValue() <= 0
                                ? "stock-warning"
                                : "stock-good"
                            }
                          >
                            {info.getValue()}
                          </span>
                        ),
                      },
                      {
                        accessorKey: "profit",
                        header: "Bénéfice réalisé",
                        cell: (info) => money(info.getValue()),
                      },
                    ]}
                  />
                </section>
              )}
              {page === "expenses" && (
                <section className="panel">
                  <div className="panel-head wrap">
                    <div>
                      <h2>Dépenses</h2>
                      <p>Les frais sont déduits du bénéfice brut confirmé.</p>
                    </div>
                    <button className="primary" onClick={() => open("expense")}>
                      <Plus size={17} /> Dépense
                    </button>
                  </div>
                  <DataTable
                    kind="depenses"
                    data={data.expenses}
                    initialSort={[{ id: "date", desc: true }]}
                    emptyText="Aucune dépense enregistrée."
                    columns={[
                      { accessorKey: "date", header: "Date" },
                      { accessorKey: "category", header: "Catégorie" },
                      {
                        accessorKey: "description",
                        header: "Description",
                        cell: (info) => <strong>{info.getValue()}</strong>,
                      },
                      {
                        accessorKey: "amount",
                        header: "Montant",
                        cell: (info) => money(info.getValue()),
                      },
                      {
                        accessorKey: "paidBy",
                        header: "Payé par",
                        cell: (info) => info.getValue() || "Non précisé",
                      },
                      {
                        id: "actions",
                        header: "",
                        enableSorting: false,
                        enableColumnFilter: false,
                        cell: ({ row }) => (
                          <div className="entry-actions">
                            <button
                              className="icon-button"
                              aria-label="Modifier la dépense"
                              onClick={() => open("expense", row.original)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label="Supprimer la dépense"
                              onClick={() => remove("expense", row.original)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ),
                      },
                    ]}
                  />
                </section>
              )}
              {page === "reports" && (
                <>
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Exporter les rapports</h2>
                        <p>
                          Fichiers CSV compatibles avec Excel, séparés par des
                          points-virgules.
                        </p>
                      </div>
                    </div>
                    <div className="report-grid">
                      {reportTypes.map(([kind, label, detail]) => (
                        <button
                          key={kind}
                          className="report-card"
                          onClick={() => exportReportCsv(kind, data)}
                        >
                          <span className="report-icon">
                            <Download size={20} />
                          </span>
                          <strong>{label}</strong>
                          <small>{detail}</small>
                          <span className="report-link">
                            Télécharger le CSV <ArrowUpRight size={14} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <div className="two-col settings-cols">
                    <section className="panel">
                      <h3>Paramètres de prix</h3>
                      <div className="field-row">
                        <label>
                          Marge cible par défaut (%)
                          <input
                            type="number"
                            min="0"
                            max="99.9"
                            step="0.1"
                            value={data.settings.margin}
                            onChange={(e) =>
                              setData((current) => ({
                                ...current,
                                settings: {
                                  ...current.settings,
                                  margin: Math.min(
                                    99.9,
                                    Math.max(0, Number(e.target.value)),
                                  ),
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Pas d’arrondi (G)
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={data.settings.priceStep}
                            onChange={(e) =>
                              setData((current) => ({
                                ...current,
                                settings: {
                                  ...current.settings,
                                  priceStep: Math.max(
                                    1,
                                    Math.round(Number(e.target.value) || 1),
                                  ),
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                      <p>Chaque produit peut avoir sa propre marge cible.</p>
                    </section>
                    <section className="panel">
                      <h3>Sauvegarde commune</h3>
                      <p>
                        Les données sont partagées via D1. Conserve une
                        sauvegarde JSON régulière.
                      </p>
                      <div className="backup-actions">
                        <button className="secondary" onClick={backup}>
                          <HardDriveDownload size={17} /> Télécharger JSON
                        </button>
                        <label className="secondary file-label">
                          Restaurer JSON
                          <input
                            type="file"
                            accept="application/json,.json"
                            onChange={restore}
                          />
                        </label>
                      </div>
                      <button
                        className="text-button reset"
                        onClick={async () => {
                          if (
                            window.confirm(
                              "Effacer toutes les données communes et revenir à un catalogue vide ?",
                            )
                          ) {
                            try {
                              await importBackup(cloneInitial());
                              setNotice("Données communes réinitialisées.");
                            } catch (error) {
                              setNotice(error.message);
                            }
                          }
                        }}
                      >
                        Réinitialiser les données
                      </button>
                    </section>
                  </div>
                </>
              )}
            </div>
            <div
              id="drawer-slot"
              className={`drawer-slot${drawer?.open ? " is-open" : ""}`}
              data-size={drawer?.owner === "form" ? "form" : "table"}
            />
          </div>
        </main>
        {dialog &&
          drawer?.owner === "form" &&
          dialog.type !== "purchaseOrder" &&
          dialog.type !== "invoice" &&
          document.getElementById("drawer-slot") &&
          createPortal(
            <>
              <div
                className={`drawer-backdrop${drawer.open ? " is-open" : ""}`}
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) closeDrawer();
                }}
              />
              <aside
                className={`modal drawer-pane${drawer.open ? " is-open" : ""}`}
                inert={!drawer.open}
                role="dialog"
                aria-modal="true"
                aria-label="Formulaire de saisie"
              >
                <div className="modal-head">
                  <div>
                    <h2>
                      {dialog.id ? "Modifier" : "Ajouter"}{" "}
                      {
                        {
                          family: "une fiche produit",
                          variant: "une variante",
                          supplier: "un fournisseur",
                          customer: "un client",
                          purchaseOrder: "un bon de commande",
                          invoice: "une facture de réception",
                          sale: "une vente",
                          expense: "une dépense",
                        }[dialog.type]
                      }
                    </h2>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Fermer"
                    onClick={closeDrawer}
                  >
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={save} className="form">
                  {dialog.type === "family" && (
                    <>
                      <Field
                        label="Nom"
                        value={dialog.fields.name}
                        onChange={(v) => setField("name", v)}
                        required
                      />
                      <div className="field-row">
                        <Field
                          label="Catégorie"
                          value={dialog.fields.category}
                          onChange={(v) => setField("category", v)}
                          placeholder="Vin"
                          required
                        />
                      </div>
                    </>
                  )}
                  {dialog.type === "variant" && (
                    <>
                      <Field
                        label="Code produit"
                        value={dialog.fields.code}
                        onChange={(v) => setField("code", v)}
                        disabled={Boolean(dialog.id)}
                      />
                      <Field
                        label="Variante"
                        value={dialog.fields.variant}
                        onChange={(v) => setField("variant", v)}
                        placeholder="Blanc, Rosé, Rouge…"
                      />
                      <Field
                        label="Volume"
                        value={dialog.fields.format}
                        onChange={(v) => setField("format", v)}
                        placeholder="75 cl"
                        required
                      />
                      <div className="field-row">
                        <Field
                          label="Unités par caisse"
                          type="number"
                          min="1"
                          step="1"
                          value={dialog.fields.unitsPerCase}
                          onChange={(v) => setField("unitsPerCase", v)}
                          required
                        />
                        <Field
                          label="Marge cible (%)"
                          type="number"
                          min="0"
                          max="99.9"
                          step="0.1"
                          placeholder={`Défaut : ${data.settings.margin} %`}
                          value={dialog.fields.margin}
                          onChange={(v) => setField("margin", v)}
                        />
                      </div>
                      <div className="picture-field">
                        <span>Photo de la variante</span>
                        {dialog.fields.picture ? (
                          <img
                            src={`/images/${dialog.fields.picture}`}
                            alt="Aperçu de la variante"
                          />
                        ) : (
                          <div className="picture-placeholder">
                            Aucune photo
                          </div>
                        )}
                        <div className="field-row">
                          <label className="secondary file-label">
                            {uploadingPicture
                              ? "Envoi en cours…"
                              : "Choisir une photo"}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={uploadPicture}
                              disabled={uploadingPicture}
                            />
                          </label>
                          {dialog.fields.picture && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setField("picture", null)}
                            >
                              Retirer la photo
                            </button>
                          )}
                        </div>
                        <small>JPEG, PNG ou WebP · 5 Mo maximum</small>
                      </div>
                      <label className="publish-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(dialog.fields.published)}
                          onChange={(event) =>
                            setField("published", event.target.checked)
                          }
                        />
                        <span>Publier cette variante sur la vitrine</span>
                      </label>
                    </>
                  )}
                  {(dialog.type === "supplier" ||
                    dialog.type === "customer") && (
                    <>
                      <Field
                        label="Nom"
                        value={dialog.fields.name}
                        onChange={(v) => setField("name", v)}
                        required
                      />
                      <Field
                        label="Contact principal"
                        value={dialog.fields.contact}
                        onChange={(v) => setField("contact", v)}
                      />
                      <div className="field-row">
                        <Field
                          label="Téléphone"
                          type="tel"
                          value={dialog.fields.phone}
                          onChange={(v) => setField("phone", v)}
                        />
                        <Field
                          label="Email"
                          type="email"
                          value={dialog.fields.email}
                          onChange={(v) => setField("email", v)}
                        />
                      </div>
                      <Field
                        label="Adresse"
                        value={dialog.fields.address}
                        onChange={(v) => setField("address", v)}
                      />
                      <Field
                        label="Notes"
                        value={dialog.fields.note}
                        onChange={(v) => setField("note", v)}
                      />
                    </>
                  )}
                  {dialog.type === "purchaseOrder" && (
                    <>
                      <div className="field-row">
                        <Field
                          label="Date"
                          type="date"
                          value={dialog.fields.date}
                          onChange={(v) => setField("date", v)}
                          required
                        />
                        <Field
                          label="N° PO"
                          value={dialog.fields.number}
                          onChange={(v) => setField("number", v)}
                          required
                        />
                      </div>
                      <EntitySelect
                        label="Fournisseur"
                        value={dialog.fields.supplierId}
                        onChange={(v) => setField("supplierId", v)}
                        rows={data.suppliers}
                        required
                        disabled={Boolean(
                          report.purchaseOrders.find(
                            (row) => row.id === dialog.id,
                          )?.receivedInvoices.length,
                        )}
                      />
                      <SelectField
                        label="État"
                        value={dialog.fields.stage}
                        onChange={(v) => setField("stage", v)}
                        options={[
                          ["draft", "Brouillon"],
                          ["ordered", "Commandé"],
                          ["cancelled", "Annulé"],
                        ]}
                      />
                      <Field
                        label="Notes"
                        value={dialog.fields.note}
                        onChange={(v) => setField("note", v)}
                      />
                      <div className="invoice-lines">
                        <strong>Produits commandés</strong>
                        {dialog.fields.lines.map((line, index) => (
                          <div className="invoice-line-form" key={line.id}>
                            <div className="invoice-line-head">
                              <b>Ligne {index + 1}</b>
                              <button
                                type="button"
                                className="icon-button danger"
                                aria-label={`Supprimer la ligne ${index + 1}`}
                                disabled={Boolean(
                                  report.purchaseOrders.find(
                                    (row) => row.id === dialog.id,
                                  )?.receivedInvoices.length,
                                )}
                                onClick={() => deleteOrderLine(index)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                            <Field
                              label="Code ou nom complet du produit"
                              list="product-options"
                              value={line.search}
                              onChange={(v) => setOrderLine(index, "search", v)}
                              disabled={Boolean(
                                report.purchaseOrders.find(
                                  (row) => row.id === dialog.id,
                                )?.receivedInvoices.length,
                              )}
                              required
                            />
                            <div className="field-row">
                              <Field
                                label="Caisses commandées"
                                type="number"
                                min="1"
                                step="1"
                                value={line.cases}
                                onChange={(v) =>
                                  setOrderLine(index, "cases", v)
                                }
                                disabled={Boolean(
                                  report.purchaseOrders.find(
                                    (row) => row.id === dialog.id,
                                  )?.receivedInvoices.length,
                                )}
                                required
                              />
                              <Field
                                label="Prix prévu par caisse (G)"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={line.casePrice}
                                onChange={(v) =>
                                  setOrderLine(index, "casePrice", v)
                                }
                                disabled={Boolean(
                                  report.purchaseOrders.find(
                                    (row) => row.id === dialog.id,
                                  )?.receivedInvoices.length,
                                )}
                                required
                              />
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="secondary"
                          disabled={Boolean(
                            report.purchaseOrders.find(
                              (row) => row.id === dialog.id,
                            )?.receivedInvoices.length,
                          )}
                          onClick={addOrderLine}
                        >
                          <Plus size={16} /> Ajouter un produit
                        </button>
                        <div className="invoice-form-total">
                          Total prévu :{" "}
                          <b>
                            {money(
                              dialog.fields.lines.reduce(
                                (sum, line) =>
                                  sum +
                                  Number(line.cases || 0) *
                                    Number(line.casePrice || 0),
                                0,
                              ),
                            )}
                          </b>
                        </div>
                      </div>
                    </>
                  )}
                  {dialog.type === "invoice" && (
                    <>
                      <Field
                        label="Date de réception"
                        type="date"
                        value={dialog.fields.date}
                        onChange={(v) => setField("date", v)}
                        required
                      />
                      <div className="field-row">
                        <EntitySelect
                          label="Fournisseur"
                          value={dialog.fields.supplierId || ""}
                          onChange={selectInvoiceSupplier}
                          rows={data.suppliers}
                          required={!dialog.id}
                        />
                        <Field
                          label="N° facture"
                          value={dialog.fields.number}
                          onChange={(v) => setField("number", v)}
                          required={!dialog.id}
                        />
                      </div>
                      {!data.suppliers.length && (
                        <p>Crée d’abord une fiche fournisseur.</p>
                      )}
                      <label className="field">
                        <span>Bon de commande lié</span>
                        <select
                          value={dialog.fields.purchaseOrderId || ""}
                          onChange={(event) =>
                            selectInvoiceOrder(event.target.value)
                          }
                        >
                          <option value="">Aucun PO</option>
                          {report.purchaseOrders
                            .filter(
                              (order) =>
                                order.supplierId === dialog.fields.supplierId &&
                                order.stage === "ordered",
                            )
                            .map((order) => (
                              <option key={order.id} value={order.id}>
                                {order.number} · {order.status}
                              </option>
                            ))}
                        </select>
                      </label>
                      <Field
                        label="Notes facture"
                        value={dialog.fields.note}
                        onChange={(v) => setField("note", v)}
                      />
                      <div className="invoice-lines">
                        <strong>Produits reçus</strong>
                        {dialog.fields.lines.map((line, index) => (
                          <div className="invoice-line-form" key={line.id}>
                            <div className="invoice-line-head">
                              <b>Ligne {index + 1}</b>
                              <button
                                type="button"
                                className="icon-button danger"
                                aria-label={`Supprimer la ligne ${index + 1}`}
                                onClick={() => deleteInvoiceLine(index)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                            <Field
                              label="Code ou nom complet du produit"
                              list="product-options"
                              value={line.search}
                              onChange={(v) =>
                                setInvoiceLine(index, "search", v)
                              }
                              required
                            />
                            <div className="field-row">
                              <Field
                                label="Caisses reçues"
                                type="number"
                                min="1"
                                step="1"
                                value={line.cases}
                                onChange={(v) =>
                                  setInvoiceLine(index, "cases", v)
                                }
                                required
                              />
                              <Field
                                label="Prix réel par caisse (G)"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={line.casePrice}
                                onChange={(v) =>
                                  setInvoiceLine(index, "casePrice", v)
                                }
                                required
                              />
                            </div>
                            <Field
                              label="Notes ligne"
                              value={line.note}
                              onChange={(v) => setInvoiceLine(index, "note", v)}
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          className="secondary"
                          onClick={addInvoiceLine}
                        >
                          <Plus size={16} /> Ajouter un produit
                        </button>
                        <div className="invoice-form-total">
                          Total facture :{" "}
                          <b>
                            {money(
                              dialog.fields.lines.reduce(
                                (sum, line) =>
                                  sum +
                                  Number(line.cases || 0) *
                                    Number(line.casePrice || 0),
                                0,
                              ),
                            )}
                          </b>
                        </div>
                      </div>
                    </>
                  )}
                   {(dialog.type === "invoice" ||
                     dialog.type === "purchaseOrder") && (
                    <datalist id="product-options">
                      {catalog.flatMap((p) => [
                        <option key={`c-${p.code}`} value={p.code}>
                          {productName(p)}
                        </option>,
                        <option key={`n-${p.code}`} value={productName(p)}>
                          {p.code}
                        </option>,
                      ])}
                    </datalist>
                  )}
                  {dialog.type === "expense" && (
                    <>
                      <Field
                        label="Date"
                        type="date"
                        value={dialog.fields.date}
                        onChange={(v) => setField("date", v)}
                        required
                      />
                      <SelectField
                        label="Catégorie"
                        value={dialog.fields.category}
                        onChange={(v) => setField("category", v)}
                        options={[
                          "Transport",
                          "Livraison",
                          "Emballage",
                          "Publicité",
                          "Perte/Casse",
                          "Autre",
                        ]}
                      />
                      <Field
                        label="Description"
                        value={dialog.fields.description}
                        onChange={(v) => setField("description", v)}
                        required
                      />
                      <div className="field-row">
                        <Field
                          label="Montant (G)"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={dialog.fields.amount}
                          onChange={(v) => setField("amount", v)}
                          required
                        />
                        <Field
                          label="Payé par"
                          value={dialog.fields.paidBy}
                          onChange={(v) => setField("paidBy", v)}
                        />
                      </div>
                      <Field
                        label="Justificatif / notes"
                        value={dialog.fields.note}
                        onChange={(v) => setField("note", v)}
                      />
                    </>
                  )}
                  {dialog.error && (
                    <div className="form-error">
                      <AlertTriangle size={17} />
                      {dialog.error}
                    </div>
                  )}
                  <div className="form-actions">
                    {dialog.id && (
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => remove(dialog.type, dialog.fields)}
                      >
                        <Trash2 size={17} /> Supprimer
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      onClick={closeDrawer}
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="primary"
                      disabled={uploadingPicture}
                    >
                      <Check size={17} /> Enregistrer
                    </button>
                  </div>
                </form>
              </aside>
            </>,
            document.getElementById("drawer-slot"),
          )}
        {notice && (
          <div className="toast" role="status">
            {notice}
            <button onClick={() => setNotice("")} aria-label="Fermer">
              <X size={16} />
            </button>
          </div>
        )}
        {printOrder && <PrintableDocument document={printOrder} kind="order" supplier={printOrder.supplier} />}
        {printInvoice && <PrintableDocument document={printInvoice} kind="invoice" supplier={data.suppliers.find((supplier) => supplier.id === printInvoice.supplierId)} />}
        {printSale && <PrintableDocument document={printSale} kind="sale" />}
        {(syncStatus === "connecting" || syncStatus === "unavailable") && (
          <div className="sync-overlay" role="dialog" aria-modal="true">
            <section className="panel sync-panel">
              <span className="eyebrow">DONNÉES COMMUNES</span>
              <h2>
                {syncStatus === "connecting"
                  ? "Connexion à D1…"
                  : "Connexion indisponible"}
              </h2>
              <p>Vérifie la connexion puis réessaie.</p>
              {syncError && <p role="alert">{syncError}</p>}
              <button type="button" className="secondary" onClick={refresh}>
                Réessayer
              </button>
            </section>
          </div>
        )}
        {conflicts.length > 0 && (
          <div className="sync-overlay" role="dialog" aria-modal="true">
            <section className="panel sync-panel">
              <span className="eyebrow">SYNCHRONISATION</span>
              <h2>{conflicts.length} conflit(s) à résoudre</h2>
              <p>
                Deux appareils ont modifié le même élément. Compare les versions
                avant de choisir.
              </p>
              {conflicts.map((conflict) => (
                <ConflictChoice
                  key={conflict.key}
                  conflict={conflict}
                  onResolve={resolveConflict}
                />
              ))}
            </section>
          </div>
        )}
      </div>
    </DrawerContext.Provider>
  );
}

function AppLink({ to, children, onClick, ...props }) {
  return (
    <a
      href={to}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );
}

function ConflictChoice({ conflict, onResolve }) {
  const duplicatePo = conflict.reason === "Ce numéro de PO existe déjà.";
  const [number, setNumber] = useState(conflict.local?.number || "");
  return (
    <div className="sync-conflict">
      <h3>{conflict.key}</h3>
      {conflict.reason && <p role="alert">{conflict.reason}</p>}
      <div className="sync-versions">
        <div>
          <strong>Sur cet appareil</strong>
          <pre>{JSON.stringify(conflict.local, null, 2) || "Supprimé"}</pre>
        </div>
        <div>
          <strong>Sur le serveur</strong>
          <pre>{JSON.stringify(conflict.server, null, 2) || "Supprimé"}</pre>
        </div>
      </div>
      {duplicatePo && (
        <label className="field">
          <span>Nouveau numéro pour ce PO</span>
          <input
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
        </label>
      )}
      <div className="entry-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => onResolve(conflict.key, "server")}
        >
          Garder le serveur
        </button>
        <button
          type="button"
          className="primary"
          disabled={
            Boolean(conflict.reason && !duplicatePo) ||
            (duplicatePo &&
              (!number.trim() || number.trim() === conflict.local?.number))
          }
          onClick={() =>
            onResolve(conflict.key, "local", duplicatePo ? number : undefined)
          }
        >
          {duplicatePo ? "Enregistrer avec ce numéro" : "Garder cet appareil"}
        </button>
      </div>
    </div>
  );
}

function ShareActions({ kind, id, canShare }) {
  const [active, setActive] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setUrl("");
    if (!canShare) return;
    fetch(`/admin/api/share?${new URLSearchParams({ kind, id })}`)
      .then((response) => response.json())
      .then((result) => setActive(Boolean(result.active)))
      .catch(() => setActive(false));
  }, [kind, id, canShare]);
  const create = async () => {
    try {
      const response = await fetch("/admin/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Partage impossible.");
      setUrl(result.url);
      setActive(true);
      setError("");
    } catch (cause) {
      setError(cause.message);
    }
  };
  const revoke = async () => {
    try {
      const response = await fetch(
        `/admin/api/share?${new URLSearchParams({ kind, id })}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Révocation impossible.");
      setActive(false);
      setUrl("");
      setError("");
    } catch (cause) {
      setError(cause.message);
    }
  };
  return (
    <div className="share-actions">
      <button
        type="button"
        className="secondary"
        disabled={!canShare}
        onClick={create}
      >
        {active ? "Régénérer le lien" : "Partager"}
      </button>
      {active && (
        <button
          type="button"
          className="text-button"
          disabled={!canShare}
          onClick={revoke}
        >
          Révoquer
        </button>
      )}
      {url && (
        <>
          <input
            aria-label="Lien public"
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => navigator.clipboard.writeText(url).catch(() => {})}
          >
            Copier
          </button>
        </>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

function PrintableDocument({ document, kind, supplier }) {
  const isOrder = kind === "order";
  const isSale = kind === "sale";
  const total = isSale ? document.revenue : isOrder ? document.plannedTotal : document.total;
  return (
    <section className="print-order">
      <div className="print-header">
        <div>
          <strong className="print-brand">KS</strong>
          <h1>{isOrder ? "Bon de commande" : isSale ? "Vente" : "Réception"} {document.number || "Sans numéro"}</h1>
          <p>Date : {document.date}</p>
          {isSale && <p>Statut : {saleStatusLabel(document.status)}{document.payment ? ` · Paiement : ${document.payment}` : ""}</p>}
        </div>
        <div className="print-supplier">
          <span>{isSale ? "Client" : "Fournisseur"}</span>
          <strong>{isSale ? document.customerName || document.client || "Non précisé" : supplier?.name || document.supplier || "Non précisé"}</strong>
          {!isSale && supplier?.contact && <p>{supplier.contact}</p>}
          {!isSale && supplier?.address && <p>{supplier.address}</p>}
          {!isSale && (supplier?.phone || supplier?.email) && <p>{supplier.phone} {supplier.email}</p>}
          {isSale && document.order && <p>Commande : {document.order}</p>}
        </div>
      </div>
      <table>
        <thead><tr><th>Code</th><th>Produit</th><th>{isSale ? "Unités" : "Caisses"}</th><th>{isSale ? "Prix/unité" : "Prix/caisse"}</th><th>Total</th></tr></thead>
        <tbody>{document.lines.map((line) => (
          <tr key={line.id}>
            <td>{line.productCode}</td>
            <td>{line.product ? productName(line.product) : line.productCode}{line.note && <small>{line.note}</small>}</td>
            <td>{isSale ? line.quantity : line.cases}</td>
            <td>{money(isSale ? line.unitPrice : line.casePrice)}</td>
            <td>{money(isSale ? line.revenue : Number(line.cases) * Number(line.casePrice))}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="print-summary">
        <span>{document.lines.length} produit(s) · {document.lines.reduce((sum, line) => sum + Number(isSale ? line.quantity || 0 : line.cases || 0), 0)} {isSale ? "unité(s)" : "caisse(s)"}</span>
        <strong>Total {isOrder ? "prévu" : isSale ? "vente" : "facture"} : {money(total)}</strong>
      </div>
      {document.note && <p className="print-note"><strong>Notes :</strong> {document.note}</p>}
    </section>
  );
}

function InvoiceDetail({ invoice, order, supplier, onBack, onEdit, onPrint, canShare }) {
  return (
    <div className="document-page document-workspace">
      <button
        type="button"
        className="text-button product-back"
        onClick={onBack}
      >
        ← Retour
      </button>
      <section className="panel">
        <div className="panel-head wrap">
          <div>
            <span className="eyebrow">FACTURE DE RÉCEPTION</span>
            <h2>{invoice.number || "Sans numéro"}</h2>
            <p>Réception du {invoice.date}</p>
          </div>
          <div className="entry-actions">
            <button type="button" className="secondary" onClick={onEdit}>
              <Pencil size={16} /> Modifier
            </button>
            <button type="button" className="secondary" onClick={onPrint}>
              <Printer size={16} /> Imprimer
            </button>
            <ShareActions kind="invoice" id={invoice.id} canShare={canShare} />
          </div>
        </div>
        <div className="document-facts">
          <div>
            <span>Fournisseur</span>
            <strong>
              {supplier ? (
                <AppLink
                  className="product-link"
                  to={pathFor("supplierDetail", supplier.id)}
                >
                  {supplier.name}
                </AppLink>
              ) : (
                invoice.supplier || "Non précisé"
              )}
            </strong>
          </div>
          <div>
            <span>Bon de commande</span>
            <strong>
              {order ? (
                <AppLink
                  className="product-link"
                  to={pathFor("orderDetail", order.id)}
                >
                  {order.number}
                </AppLink>
              ) : (
                "Aucun PO"
              )}
            </strong>
          </div>
          <div>
            <span>Total facture</span>
            <strong>{money(invoice.total)}</strong>
          </div>
        </div>
        {invoice.note && (
          <p className="document-note">
            <strong>Notes :</strong> {invoice.note}
          </p>
        )}
      </section>
      <section className="panel document-items">
        <div className="panel-head">
          <h3>Produits reçus</h3>
        </div>
        <div className="document-line-head"><span>Produit</span><span>Quantité</span><span>Coût/caisse</span><span>Total</span></div>
        {invoice.lines.length ? (
          invoice.lines.map((line) => (
            <div className="document-line" key={line.id}>
              <div>
                <strong>
                  {line.product ? productName(line.product) : line.productCode}
                </strong>
                <small>
                  {line.productCode}
                  {line.note ? ` · ${line.note}` : ""}
                </small>
              </div>
              <div className="document-line-values">
                <span>
                  {line.cases} caisse{Number(line.cases) > 1 ? "s" : ""} ·{" "}
                  {line.units} unités
                </span>
                <span>{money(line.casePrice)} / caisse</span>
                <b>{money(line.cost)}</b>
              </div>
            </div>
          ))
        ) : (
          <Empty text="Aucun produit reçu." />
        )}
        <div className="document-total">
          Total <strong>{money(invoice.total)}</strong>
        </div>
      </section>
    </div>
  );
}

function OrderDetail({
  order,
  onBack,
  onEdit,
  onPrint,
  onNewInvoice,
  canShare,
}) {
  return (
    <div className="document-page document-workspace">
      <button
        type="button"
        className="text-button product-back"
        onClick={onBack}
      >
        ← Retour
      </button>
      <section className="panel">
        <div className="panel-head wrap">
          <div>
            <span className="eyebrow">BON DE COMMANDE</span>
            <h2>{order.number}</h2>
            <p>
              {order.date} · {order.status}
            </p>
          </div>
          <div className="entry-actions">
            <button type="button" className="secondary" onClick={onEdit}>
              <Pencil size={16} /> Modifier
            </button>
            <button type="button" className="secondary" onClick={onPrint}>
              <Printer size={16} /> Imprimer
            </button>
            <ShareActions kind="order" id={order.id} canShare={canShare} />
          </div>
        </div>
        <div className="document-facts">
          <div>
            <span>Fournisseur</span>
            <strong>
              {order.supplier ? (
                <AppLink
                  className="product-link"
                  to={pathFor("supplierDetail", order.supplierId)}
                >
                  {order.supplier.name}
                </AppLink>
              ) : (
                "Non précisé"
              )}
            </strong>
          </div>
          <div>
            <span>Total prévu</span>
            <strong>{money(order.plannedTotal)}</strong>
          </div>
          <div>
            <span>Total reçu</span>
            <strong>{money(order.receivedTotal)}</strong>
          </div>
        </div>
        {order.note && (
          <p className="document-note">
            <strong>Notes :</strong> {order.note}
          </p>
        )}
      </section>
      <section className="panel document-items">
        <div className="panel-head">
          <h3>Produits commandés</h3>
        </div>
        <div className="document-line-head"><span>Produit</span><span>Quantités</span><span>Prix/caisse</span><span>Écart</span></div>
        {order.lines.map((line) => (
          <div className="document-line" key={line.id}>
            <div>
              <strong>
                {line.product ? productName(line.product) : line.productCode}
              </strong>
              <small>{line.productCode}</small>
            </div>
            <div className="document-line-values">
              <span>
                {line.cases} prévues · {line.receivedCases} reçues ·{" "}
                {line.remainingCases} restantes
              </span>
              <span>
                {money(line.casePrice)} / caisse ·{" "}
                {money(Number(line.cases) * Number(line.casePrice))} prévu
              </span>
              {(line.excessCases > 0 || line.priceDifference !== 0) && (
                <small className="document-variance">
                  {line.excessCases > 0 ? `${line.excessCases} en plus` : ""}
                  {line.excessCases > 0 && line.priceDifference !== 0
                    ? " · "
                    : ""}
                  {line.priceDifference !== 0
                    ? `Écart prix : ${money(line.priceDifference)} / caisse`
                    : ""}
                </small>
              )}
            </div>
          </div>
        ))}
        {order.unexpected.map(([code, actual]) => (
          <p className="document-variance" key={code}>
            Produit hors PO : {code} · {actual.cases} caisse(s) ·{" "}
            {money(actual.cost)}
          </p>
        ))}
      </section>
      <section className="panel">
        <div className="panel-head wrap">
          <div>
            <h3>Factures liées</h3>
            <p>{order.receivedInvoices.length} facture(s)</p>
          </div>
          {order.stage === "ordered" &&
            order.lines.some((line) => line.remainingCases > 0) && (
              <button type="button" className="primary" onClick={onNewInvoice}>
                <Plus size={16} /> Recevoir
              </button>
            )}
        </div>
        {order.receivedInvoices.length ? (
          order.receivedInvoices.map((invoice) => (
            <div className="document-line" key={invoice.id}>
              <div>
                <AppLink
                  className="product-link"
                  to={pathFor("invoiceDetail", invoice.id)}
                >
                  {invoice.number || "Sans numéro"}
                </AppLink>
                <small>{invoice.date}</small>
              </div>
              <b>{money(invoice.total)}</b>
            </div>
          ))
        ) : (
          <Empty text="Aucune facture liée à ce PO." />
        )}
      </section>
    </div>
  );
}

function ContactDetail({
  type,
  contact,
  invoices,
  orders,
  sales,
  returnLabel,
  onBack,
  onEdit,
  onDelete,
  onNewInvoice,
  onNewOrder,
  onNewSale,
  onEditInvoice,
  onEditOrder,
  onEditSale,
  activeSupplierTab,
  onSupplierTabChange,
}) {
  const supplier = type === "supplier";
  const supplierTabRefs = useRef({});
  const selectSupplierTabWithKeyboard = (event, currentTab) => {
    const nextTab =
      event.key === "ArrowRight" || event.key === "ArrowLeft"
        ? currentTab === "invoices"
          ? "orders"
          : "invoices"
        : event.key === "Home"
          ? "invoices"
          : event.key === "End"
            ? "orders"
            : null;
    if (!nextTab) return;
    event.preventDefault();
    onSupplierTabChange(nextTab);
    supplierTabRefs.current[nextTab]?.focus();
  };
  const confirmedSales = sales.filter(
    (sale) => sale.status === "Confirmée/Vendue",
  );
  const confirmedRevenue = confirmedSales.reduce(
    (sum, sale) => sum + sale.revenue,
    0,
  );
  const sortedInvoices = [...invoices].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const sortedOrders = [...orders].sort((a, b) => b.date.localeCompare(a.date));
  const sortedSales = [...sales].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="contact-page">
      <button
        type="button"
        className="text-button product-back"
        onClick={onBack}
      >
        ← Retour à {returnLabel}
      </button>
      <section className="panel contact-summary">
        <div className="panel-head wrap">
          <div>
            <span className="eyebrow">
              {supplier ? "FICHE FOURNISSEUR" : "FICHE CLIENT"}
            </span>
            <h2>{contact.name}</h2>
            <p>
              {supplier
                ? `${invoices.length} facture(s) · ${orders.length} PO`
                : `${sales.length} vente(s) · ${confirmedSales.length} confirmée(s)`}
            </p>
          </div>
          <div className="entry-actions">
            <button type="button" className="secondary" onClick={onEdit}>
              <Pencil size={16} /> Modifier
            </button>
            <button
              type="button"
              className="icon-button danger"
              aria-label={`Supprimer ${contact.name}`}
              onClick={onDelete}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <div className="contact-facts">
          <div>
            <span>Contact principal</span>
            <strong>{contact.contact || "Non précisé"}</strong>
          </div>
          <div>
            <span>Téléphone</span>
            <strong>
              {contact.phone ? (
                <a href={`tel:${contact.phone}`}>{contact.phone}</a>
              ) : (
                "Non précisé"
              )}
            </strong>
          </div>
          <div>
            <span>Email</span>
            <strong>
              {contact.email ? (
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              ) : (
                "Non précisé"
              )}
            </strong>
          </div>
          <div>
            <span>Adresse</span>
            <strong>{contact.address || "Non précisée"}</strong>
          </div>
        </div>
        {contact.note && <p className="contact-notes">{contact.note}</p>}
      </section>
      {supplier ? (
        <>
          <div className="contact-metrics">
            <div>
              <span>Factures enregistrées</span>
              <strong>{invoices.length}</strong>
            </div>
            <div>
              <span>Total des réceptions</span>
              <strong>
                {money(
                  invoices.reduce((sum, invoice) => sum + invoice.total, 0),
                )}
              </strong>
            </div>
            <div>
              <span>PO</span>
              <strong>{orders.length}</strong>
            </div>
          </div>
          <div
            className="contact-tabs"
            role="tablist"
            aria-label="Activité du fournisseur"
          >
            <button
              type="button"
              role="tab"
              id={`supplier-tab-invoices-${contact.id}`}
              aria-controls={`supplier-panel-invoices-${contact.id}`}
              aria-selected={activeSupplierTab === "invoices"}
              tabIndex={activeSupplierTab === "invoices" ? 0 : -1}
              ref={(node) => {
                supplierTabRefs.current.invoices = node;
              }}
              onClick={() => onSupplierTabChange("invoices")}
              onKeyDown={(event) =>
                selectSupplierTabWithKeyboard(event, "invoices")
              }
            >
              Factures <span>{invoices.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              id={`supplier-tab-orders-${contact.id}`}
              aria-controls={`supplier-panel-orders-${contact.id}`}
              aria-selected={activeSupplierTab === "orders"}
              tabIndex={activeSupplierTab === "orders" ? 0 : -1}
              ref={(node) => {
                supplierTabRefs.current.orders = node;
              }}
              onClick={() => onSupplierTabChange("orders")}
              onKeyDown={(event) =>
                selectSupplierTabWithKeyboard(event, "orders")
              }
            >
              Bons de commande <span>{orders.length}</span>
            </button>
          </div>
          <section
            className="panel contact-tab-panel"
            role="tabpanel"
            id={`supplier-panel-invoices-${contact.id}`}
            aria-labelledby={`supplier-tab-invoices-${contact.id}`}
            tabIndex={0}
            hidden={activeSupplierTab !== "invoices"}
          >
            <div className="panel-head wrap">
              <div>
                <h2>Factures de réception</h2>
                <p>Réceptions liées à ce fournisseur.</p>
              </div>
              <button type="button" className="primary" onClick={onNewInvoice}>
                <Plus size={16} /> Nouvelle facture
              </button>
            </div>
            {sortedInvoices.length ? (
              sortedInvoices.map((invoice) => (
                <div className="contact-history-row" key={invoice.id}>
                  <div>
                    <AppLink
                      className="product-link"
                      to={pathFor("invoiceDetail", invoice.id)}
                    >
                      {invoice.number || "Sans numéro"}
                    </AppLink>
                    <small>
                      {invoice.date} · {invoice.lines.length} produit(s)
                      {orders.some(
                        (order) => order.id === invoice.purchaseOrderId,
                      ) && (
                        <>
                          {" "}
                          · PO{" "}
                          <AppLink
                            className="product-link"
                            to={pathFor("orderDetail", invoice.purchaseOrderId)}
                          >
                            {invoice.purchaseOrderNumber}
                          </AppLink>
                        </>
                      )}
                    </small>
                  </div>
                  <div className="contact-history-actions">
                    <b>{money(invoice.total)}</b>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Modifier la facture ${invoice.number || invoice.date}`}
                      onClick={() => onEditInvoice(invoice)}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="Aucune facture pour ce fournisseur." />
            )}
          </section>
          <section
            className="panel contact-tab-panel"
            role="tabpanel"
            id={`supplier-panel-orders-${contact.id}`}
            aria-labelledby={`supplier-tab-orders-${contact.id}`}
            tabIndex={0}
            hidden={activeSupplierTab !== "orders"}
          >
            <div className="panel-head wrap">
              <div>
                <h2>Bons de commande</h2>
                <p>Montants prévus et réceptionnés.</p>
              </div>
              <button type="button" className="primary" onClick={onNewOrder}>
                <Plus size={16} /> Nouveau PO
              </button>
            </div>
            {sortedOrders.length ? (
              sortedOrders.map((order) => (
                <div className="contact-history-row" key={order.id}>
                  <div>
                    <AppLink
                      className="product-link"
                      to={pathFor("orderDetail", order.id)}
                    >
                      {order.number}
                    </AppLink>
                    <small>
                      {order.date} · {order.status}
                      {order.hasVariance ? " · Écart" : ""}
                    </small>
                  </div>
                  <div className="contact-history-actions">
                    <b>
                      {money(order.plannedTotal)} prévu ·{" "}
                      {money(order.receivedTotal)} reçu
                    </b>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Modifier le PO ${order.number}`}
                      onClick={() => onEditOrder(order)}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="Aucun PO pour ce fournisseur." />
            )}
          </section>
        </>
      ) : (
        <>
          <div className="contact-metrics">
            <div>
              <span>Ventes confirmées</span>
              <strong>{confirmedSales.length}</strong>
            </div>
            <div>
              <span>Chiffre d’affaires confirmé</span>
              <strong>{money(confirmedRevenue)}</strong>
            </div>
            <div>
              <span>Autres statuts</span>
              <strong>{sales.length - confirmedSales.length}</strong>
            </div>
          </div>
          <section className="panel">
            <div className="panel-head wrap">
              <div>
                <h2>Ventes</h2>
                <p>Historique de toutes les ventes liées à ce client.</p>
              </div>
              <button type="button" className="primary" onClick={onNewSale}>
                <Plus size={16} /> Nouvelle vente
              </button>
            </div>
            {sortedSales.length ? (
              sortedSales.map((sale) => (
                <div className="contact-history-row" key={sale.id}>
                  <div>
                    <strong>
                      <AppLink className="product-link" to={pathFor("saleDetail", sale.id)}>{sale.number} · {sale.lines.length} produit(s)</AppLink>
                    </strong>
                    <small>
                      {sale.date} · {sale.quantity} unité(s) · {saleStatusLabel(sale.status)}
                      {sale.order ? ` · ${sale.order}` : ""}
                    </small>
                  </div>
                  <div className="contact-history-actions">
                    <b>{money(sale.revenue)}</b>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Modifier la vente du ${sale.date}`}
                      onClick={() => onEditSale(sale)}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="Aucune vente pour ce client." />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SaleDetail({ sale, canShare, onBack, onEdit, onPrint, onDelete }) {
  return <div className="document-page document-workspace sale-document">
    <button type="button" className="text-button product-back" onClick={onBack}>← Retour</button>
    <section className="panel">
      <div className="panel-head wrap"><div><span className="eyebrow">VENTE</span><h2>{sale.number}</h2><p>{sale.date} · {saleStatusLabel(sale.status)}</p></div>
        <div className="entry-actions"><button type="button" className="secondary" onClick={onPrint}><Printer size={16}/> Imprimer</button>
          <button type="button" className="secondary" onClick={onEdit}><Pencil size={16}/> Modifier</button>
          <ShareActions kind="sale" id={sale.id} canShare={canShare}/>
          <button type="button" className="icon-button danger" aria-label="Supprimer la vente" onClick={onDelete}><Trash2 size={16}/></button></div></div>
      <div className="document-facts"><div><span>Client</span><strong>{sale.customerName || sale.client || "Non précisé"}</strong></div>
        <div><span>Commande</span><strong>{sale.order || "—"}</strong></div><div><span>Paiement</span><strong>{sale.payment || "—"}</strong></div>
        <div><span>Total</span><strong>{money(sale.revenue)}</strong></div></div>
      {sale.note && <p className="document-note"><strong>Notes :</strong> {sale.note}</p>}
    </section>
    <section className="panel document-items"><div className="panel-head"><h3>Produits vendus</h3></div>
      <div className="document-line-head"><span>Produit</span><span>Unités</span><span>Prix/unité</span><span>Total</span></div>
      {sale.lines.map(line => <div className="document-line" key={line.id}><div><strong>{line.product ? productName(line.product) : line.productCode}</strong><small>{line.productCode}</small></div>
        <div className="document-line-values"><span>{line.quantity} unité(s)</span><span>{money(line.unitPrice)}</span><strong>{money(line.revenue)}</strong></div></div>)}
      <div className="document-total">Total : <strong>{money(sale.revenue)}</strong></div>
    </section>
    <section className="panel sale-internal"><h3>Résultat interne</h3><p>Coût : {sale.validCost ? money(sale.cost) : "Indisponible"} · Bénéfice : {sale.validCost ? money(sale.profit) : "Indisponible"} · Marge : {sale.validCost ? percent(sale.margin) : "—"}</p></section>
  </div>;
}

function SaleEditor({ fields, error, catalog, customers, onField, onLine, onDeleteLine, onAddProduct,
  onCreateProduct, onCreateCustomer, onSave, onCancel }) {
  const [productQuery, setProductQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState(() => customers.find(row => row.id === fields.customerId)?.name || "");
  const [createKind, setCreateKind] = useState(null);
  const [createError, setCreateError] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", contact: "", phone: "", email: "", address: "" });
  const [newProduct, setNewProduct] = useState({ name: "", volume: "", category: "", variant: "", code: "", unitsPerCase: 6 });
  const products = catalog.filter(p => `${p.code} ${productName(p)}`.toLocaleLowerCase("fr").includes(productQuery.trim().toLocaleLowerCase("fr")));
  const matchingCustomers = customers.filter(row => row.name.toLocaleLowerCase("fr").includes(customerQuery.trim().toLocaleLowerCase("fr")));
  const selectedCustomer = customers.find(row => row.id === fields.customerId);
  const create = () => { try { const row = createKind === "customer" ? onCreateCustomer(newCustomer) : onCreateProduct(newProduct);
    if (createKind === "customer") setCustomerQuery(row.name); else setProductQuery("");
    setCreateKind(null); setCreateError(""); } catch (cause) { setCreateError(cause.message); } };
  return <form className="document-editor sale-editor" onSubmit={onSave}>
    <section className="panel document-editor-party">
      <SearchCombobox label="Rechercher un client (facultatif)" value={customerQuery}
        onChange={value => { setCustomerQuery(value); if (value !== customers.find(row => row.id === fields.customerId)?.name) onField("customerId", ""); }}
        items={matchingCustomers.slice(0, 8)} itemLabel={row => row.name}
        onPick={row => { onField("customerId", row.id); setCustomerQuery(row.name); }}
        onCreate={() => { setNewCustomer(current => ({ ...current, name: customerQuery })); setCreateKind("customer"); setCreateError(""); }} createLabel="Créer un client"/>
      <div className="document-party-summary"><span>Client · {saleStatusLabel(fields.status)}</span><strong>{selectedCustomer?.name || fields.client || "Vente sans client"}</strong>
        {selectedCustomer?.phone && <small>{selectedCustomer.phone}</small>}
        {selectedCustomer?.address && <small>{selectedCustomer.address}</small>}
        {fields.customerId && <button type="button" className="text-button" onClick={() => { onField("customerId", ""); setCustomerQuery(""); }}>Retirer</button>}</div>
    </section>
    <section className="panel document-editor-searches">
      <SearchCombobox label="Rechercher un produit" value={productQuery} onChange={setProductQuery} items={products.slice(0, 8)}
        itemLabel={p => `${p.code} · ${productName(p)}`} onPick={p => { onAddProduct(p); setProductQuery(""); }}
        onCreate={() => { setNewProduct(current => ({ ...current, name: productQuery })); setProductQuery(""); setCreateKind("product"); setCreateError(""); }} createLabel="Créer un produit" preventEnterSubmit/>
    </section>
    {createKind && <section className="panel document-editor-create"><div className="panel-head"><h3>Créer {createKind === "customer" ? "un client" : "un produit"}</h3>
      <button type="button" className="icon-button" onClick={() => setCreateKind(null)} aria-label="Fermer"><X size={17}/></button></div>
      <div className="document-editor-fields">{createKind === "customer" ? <>
        {[["name", "Nom"], ["contact", "Contact"], ["phone", "Téléphone"], ["email", "Email"], ["address", "Adresse"]].map(([key, label]) =>
          <Field key={key} label={label} value={newCustomer[key]} onChange={value => setNewCustomer(current => ({ ...current, [key]: value }))}/>)}
      </> : <>{[["name", "Nom"], ["volume", "Volume"], ["category", "Catégorie"], ["variant", "Variante"], ["code", "Code (facultatif)"]].map(([key, label]) =>
        <Field key={key} label={label} value={newProduct[key]} onChange={value => setNewProduct(current => ({ ...current, [key]: value }))}/>)}
        <Field label="Unités par caisse" type="number" min="1" step="1" value={newProduct.unitsPerCase} onChange={value => setNewProduct(current => ({ ...current, unitsPerCase: value }))}/></>}</div>
      {createError && <p role="alert" className="form-error">{createError}</p>}<button type="button" className="secondary" onClick={create}>Créer</button></section>}
    <section className="panel document-editor-info"><div className="document-editor-fields"><Field label="N° commande" value={fields.order} onChange={value => onField("order", value)}/>
      <Field label="Référence libre" value={fields.client} onChange={value => onField("client", value)}/></div></section>
    <section className="panel receipt-items"><div className="panel-head wrap"><div><h3>Produits vendus</h3><p>Ajoute un produit avec la recherche, puis indique les unités et le prix réel.</p></div><span className="document-editor-count">{fields.lines.length} ligne(s)</span></div>
      <div className="receipt-table-wrap"><table className="receipt-table"><thead><tr><th>Code</th><th>Produit</th><th>Variante</th><th>Format</th><th>Unités</th><th>Prix/unité</th><th>Total ligne</th><th><span className="sr-only">Action</span></th></tr></thead>
        <tbody>{fields.lines.map((line, index) => {
          const product = findProduct(catalog, line.search);
          return <tr key={line.id}>
            <td data-label="Code" className="receipt-code"><Field label={`Code ou nom, ligne ${index + 1}`} list="sale-products" value={line.search} onChange={value => onLine(index, "search", value)} required/></td>
            <td data-label="Produit"><strong>{product ? product.brand || productName(product) : "Produit à choisir"}</strong></td>
            <td data-label="Variante">{product?.variant || "—"}</td>
            <td data-label="Format">{product?.format || product?.volume || "—"}</td>
            <td data-label="Unités"><Field label={`Unités, ligne ${index + 1}`} type="number" min="1" step="1" value={line.quantity} onChange={value => onLine(index, "quantity", value)} required/></td>
            <td data-label="Prix/unité"><Field label={`Prix réel par unité, ligne ${index + 1}`} type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={value => onLine(index, "unitPrice", value)} required/></td>
            <td data-label="Total ligne" className="receipt-line-total">{money(Number(line.quantity || 0) * Number(line.unitPrice || 0))}</td>
            <td className="receipt-remove"><button type="button" className="icon-button danger" aria-label={`Supprimer la ligne ${index + 1}`} onClick={() => onDeleteLine(index)}><Trash2 size={15}/></button></td>
          </tr>;
        })}</tbody></table>
        {!fields.lines.length && <Empty text="Aucun produit sélectionné. Utilise la recherche pour ajouter une ligne." />}
      </div>
      <datalist id="sale-products">{catalog.flatMap(p => [<option key={p.code} value={p.code}>{productName(p)}</option>, <option key={`n-${p.code}`} value={productName(p)}>{p.code}</option>])}</datalist>
    </section>
    <section className="panel"><div className="document-editor-fields"><SelectField label="Paiement" value={fields.payment} onChange={value => onField("payment", value)} options={["", "MonCash", "NatCash", "Espèces", "Virement", "Autre"]}/>
      <Field label="Livraison / notes" value={fields.note} onChange={value => onField("note", value)}/></div></section>
    <footer className="document-editor-footer">
      <div className="document-editor-footer-fields"><Field label="Date de vente" type="date" value={fields.date} onChange={value => onField("date", value)} required/>
        <Field label="N° vente" value={fields.number} onChange={() => {}} readOnly/></div>
      <div className="document-editor-totals"><span>{fields.lines.length} produit(s) · {fields.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)} unité(s)</span><strong>Total vente : {money(fields.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0))}</strong></div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="document-editor-actions"><button type="button" className="secondary" onClick={onCancel}>Retour</button><button type="submit" value="save" className="secondary">{fields.status === "En attente" ? "Enregistrer le brouillon" : "Enregistrer"}</button>
        {fields.status === "En attente" && <button type="submit" value="sell" className="primary">Marquer vendue</button>}
        {fields.status === "Confirmée/Vendue" && <><button type="submit" value="reopen" className="secondary">Repasser en brouillon</button><button type="submit" value="cancel" className="primary">Annuler la vente</button></>}
        {fields.status === "Annulée" && <button type="submit" value="reopen" className="primary">Rouvrir en brouillon</button>}</div>
    </footer>
  </form>;
}

function DocumentEditor({
  type,
  fields,
  error,
  isEditing,
  suppliers,
  orders,
  catalog,
  onField,
  onSupplier,
  onOrder,
  onLine,
  onDeleteLine,
  onAddProduct,
  onCreateSupplier,
  onCreateProduct,
  onCancelOrder,
  onSave,
  onCancel,
}) {
  const isOrder = type === "purchaseOrder";
  const order = isOrder ? orders.find((row) => row.id === fields.id) : null;
  const locked = isOrder && Boolean(order?.receivedInvoices.length);
  const readOnly = isOrder && fields.stage === "cancelled";
  const linkedOrder = !isOrder
    ? orders.find((row) => row.id === fields.purchaseOrderId)
    : null;
  const selectedSupplier = suppliers.find((row) => row.id === fields.supplierId);
  const [productQuery, setProductQuery] = useState("");
  const [supplierQuery, setSupplierQuery] = useState(
    () => suppliers.find((row) => row.id === fields.supplierId)?.name || "",
  );
  const [expandedCode, setExpandedCode] = useState(
    () => fields.lines[0]?.search || "",
  );
  const [createKind, setCreateKind] = useState(null);
  const [createError, setCreateError] = useState("");
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
  });
  const [newProduct, setNewProduct] = useState({
    name: "",
    volume: "",
    category: "",
    variant: "",
    code: "",
    unitsPerCase: 6,
  });
  const [productCodeEdited, setProductCodeEdited] = useState(false);
  useEffect(() => {
    if (fields.supplierId)
      setSupplierQuery(
        suppliers.find((row) => row.id === fields.supplierId)?.name || "",
      );
  }, [fields.supplierId, suppliers]);
  const normalizedQuery = productQuery.trim().toLocaleLowerCase("fr");
  const visibleProducts = catalog.filter((product) =>
    `${product.code} ${productName(product)}`
      .toLocaleLowerCase("fr")
      .includes(normalizedQuery),
  );
  const supplierChoices = suppliers.filter((row) =>
    row.name
      .toLocaleLowerCase("fr")
      .includes(supplierQuery.trim().toLocaleLowerCase("fr")),
  );
  const selectedCases = fields.lines.reduce(
    (sum, line) => sum + Number(line.cases || 0),
    0,
  );
  const total = fields.lines.reduce(
    (sum, line) => sum + Number(line.cases || 0) * Number(line.casePrice || 0),
    0,
  );
  const remaining =
    order?.lines.reduce((sum, line) => sum + line.remainingCases, 0) || 0;
  const chooseProduct = (product) => {
    if (!readOnly && !locked) onAddProduct(product);
    setProductQuery("");
    setExpandedCode(product.code);
  };
  const create = (kind) => {
    try {
      if (kind === "supplier") {
        const supplier = onCreateSupplier(newSupplier);
        setSupplierQuery(supplier.name);
      } else {
        const product = onCreateProduct(newProduct);
        setProductQuery("");
        setExpandedCode(product.code);
      }
      setCreateKind(null);
      setCreateError("");
    } catch (cause) {
      setCreateError(cause.message);
    }
  };
  return (
    <form className="document-editor" onSubmit={onSave}>
      <section className="panel document-editor-party">
        <SearchCombobox
          label="Rechercher un fournisseur"
          value={supplierQuery}
          onChange={(value) => {
            setSupplierQuery(value);
            if (
              fields.supplierId &&
              value !==
                suppliers.find((row) => row.id === fields.supplierId)?.name
            ) {
              if (isOrder) onField("supplierId", "");
              else onSupplier("");
            }
          }}
          items={supplierChoices.slice(0, 8)}
          itemLabel={(row) => row.name}
          onPick={(supplier) => {
            if (isOrder) onField("supplierId", supplier.id);
            else onSupplier(supplier.id);
            setSupplierQuery(supplier.name);
          }}
          onCreate={() => {
            setNewSupplier((current) => ({ ...current, name: supplierQuery }));
            setCreateKind("supplier");
            setCreateError("");
          }}
          createLabel="Créer un fournisseur"
          disabled={readOnly || locked}
        />
        <div className="document-party-summary">
          <span>{isOrder ? `Fournisseur · ${order?.status || "Brouillon"}` : linkedOrder ? `Fournisseur · PO ${linkedOrder.number}` : "Fournisseur"}</span>
          <strong>{selectedSupplier?.name || "Aucun fournisseur sélectionné"}</strong>
          {selectedSupplier?.phone && <small>{selectedSupplier.phone}</small>}
          {selectedSupplier?.address && <small>{selectedSupplier.address}</small>}
        </div>
      </section>
      <section className="panel document-editor-searches">
        <SearchCombobox
          label="Rechercher un produit"
          value={productQuery}
          onChange={setProductQuery}
          items={visibleProducts.slice(0, 8)}
          itemLabel={(product) => `${product.code} · ${productName(product)}`}
          onPick={chooseProduct}
          onCreate={() => {
            setNewProduct({ name: productQuery, volume: "", category: "", variant: "", code: "", unitsPerCase: 6 });
            setProductQuery("");
            setProductCodeEdited(false);
            setCreateKind("product");
            setCreateError("");
          }}
          createLabel="Créer un produit"
          preventEnterSubmit
          disabled={readOnly || locked}
        />
      </section>
      {createKind && (
        <section className="panel document-editor-create">
          <div className="panel-head">
            <h3>
              Créer{" "}
              {createKind === "supplier" ? "un fournisseur" : "un produit"}
            </h3>
            <button
              type="button"
              className="icon-button"
              aria-label="Fermer la création"
              onClick={() => setCreateKind(null)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="document-editor-fields">
            {createKind === "supplier" ? (
              <>
                <Field
                  label="Nom"
                  value={newSupplier.name}
                  onChange={(value) =>
                    setNewSupplier((current) => ({ ...current, name: value }))
                  }
                />
                <Field
                  label="Contact"
                  value={newSupplier.contact}
                  onChange={(value) =>
                    setNewSupplier((current) => ({
                      ...current,
                      contact: value,
                    }))
                  }
                />
                <Field
                  label="Téléphone"
                  value={newSupplier.phone}
                  onChange={(value) =>
                    setNewSupplier((current) => ({ ...current, phone: value }))
                  }
                />
                <Field
                  label="Email"
                  type="email"
                  value={newSupplier.email}
                  onChange={(value) =>
                    setNewSupplier((current) => ({ ...current, email: value }))
                  }
                />
                <Field
                  label="Adresse"
                  value={newSupplier.address}
                  onChange={(value) =>
                    setNewSupplier((current) => ({
                      ...current,
                      address: value,
                    }))
                  }
                />
              </>
            ) : (
              <>
                <Field
                  label="Nom"
                  value={newProduct.name}
                  onChange={(value) =>
                    setNewProduct((current) => ({ ...current, name: value }))
                  }
                />
                <Field
                  label="Volume"
                  value={newProduct.volume}
                  onChange={(value) =>
                    setNewProduct((current) => ({ ...current, volume: value }))
                  }
                />
                <Field
                  label="Catégorie"
                  value={newProduct.category}
                  onChange={(value) =>
                    setNewProduct((current) => ({
                      ...current,
                      category: value,
                      code: productCodeEdited
                        ? current.code
                        : generateProductCode(value, catalog),
                    }))
                  }
                />
                <Field
                  label="Variante"
                  value={newProduct.variant}
                  onChange={(value) =>
                    setNewProduct((current) => ({ ...current, variant: value }))
                  }
                />
                <Field
                  label="Code"
                  value={newProduct.code}
                  onChange={(value) => {
                    setProductCodeEdited(true);
                    setNewProduct((current) => ({ ...current, code: value }));
                  }}
                />
                <Field
                  label="Unités par caisse"
                  type="number"
                  min="1"
                  step="1"
                  value={newProduct.unitsPerCase}
                  onChange={(value) =>
                    setNewProduct((current) => ({
                      ...current,
                      unitsPerCase: value,
                    }))
                  }
                />
              </>
            )}
          </div>
          {createError && (
            <div className="form-error" role="alert">
              {createError}
            </div>
          )}
          <button
            type="button"
            className="primary"
            onClick={() => create(createKind)}
          >
            <Plus size={16} /> Créer et sélectionner
          </button>
        </section>
      )}
      <section className="panel document-editor-info">
        {!isOrder && (
          <div className="document-editor-fields">
            <label className="field">
              <span>Bon de commande lié</span>
              <select
                value={fields.purchaseOrderId || ""}
                onChange={(event) => onOrder(event.target.value)}
              >
                <option value="">Aucun PO</option>
                {orders
                  .filter(
                    (row) =>
                      row.supplierId === fields.supplierId &&
                      row.stage === "ordered",
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.number} · {row.status}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        <Field
          label={isOrder ? "Notes du bon" : "Notes facture"}
          value={fields.note}
          onChange={(value) => onField("note", value)}
          disabled={readOnly}
        />
      </section>
      {isOrder ? (
        <section className="panel receipt-items document-editor-products">
          <div className="panel-head wrap">
            <div>
              <h3>Produits commandés</h3>
              <p>Choisis un produit dans la recherche, puis saisis les caisses et le prix prévu.</p>
            </div>
            <span className="document-editor-count">
              {fields.lines.length} ligne(s)
            </span>
          </div>
          <div className="receipt-table-wrap">
            <table className="receipt-table">
              <thead><tr><th>Code</th><th>Produit</th><th>Variante</th><th>Format</th><th>Caisses</th><th>Prix/caisse</th><th>Total ligne</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>{fields.lines.map((line, index) => {
                const product = catalog.find((item) => item.code.toLocaleLowerCase("fr") === String(line.search).toLocaleLowerCase("fr"));
                return <tr key={line.id}>
                  <td data-label="Code" className="receipt-code">{product?.code || line.search}</td>
                  <td data-label="Produit"><strong>{product ? product.brand || productName(product) : "Produit à choisir"}</strong></td>
                  <td data-label="Variante">{product?.variant || "—"}</td>
                  <td data-label="Format">{product?.format || product?.volume || "—"}</td>
                  <td data-label="Caisses"><Field label={`Caisses, ligne ${index + 1}`} type="number" min="1" step="1" value={line.cases} onChange={(value) => onLine(index, "cases", value)} disabled={readOnly || locked} required /></td>
                  <td data-label="Prix/caisse"><Field label={`Prix par caisse, ligne ${index + 1}`} type="number" min="0.01" step="0.01" value={line.casePrice} onChange={(value) => onLine(index, "casePrice", value)} disabled={readOnly || locked} required /></td>
                  <td data-label="Total ligne" className="receipt-line-total">{money(Number(line.cases || 0) * Number(line.casePrice || 0))}</td>
                  <td className="receipt-remove"><button type="button" className="icon-button danger" aria-label={`Retirer la ligne ${index + 1}`} disabled={readOnly || locked} onClick={() => onDeleteLine(index)}><Trash2 size={16} /></button></td>
                </tr>;
              })}</tbody>
            </table>
            {!fields.lines.length && <Empty text="Aucun produit sélectionné. Utilise la recherche pour ajouter une ligne." />}
          </div>
        </section>
      ) : (
        <section className="panel receipt-items">
          <div className="panel-head wrap">
            <div>
              <h3>Produits reçus</h3>
              <p>
                Ajoute un produit avec la recherche, puis indique les caisses et
                le coût réel.
              </p>
            </div>
            <span className="document-editor-count">
              {fields.lines.length} ligne(s)
            </span>
          </div>
          <div className="receipt-table-wrap">
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Produit</th>
                  <th>Variante</th>
                  <th>Format</th>
                  <th>Caisses</th>
                  <th>Coût/caisse</th>
                  <th>Total ligne</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.lines.map((line, index) => {
                  const product = catalog.find(
                    (item) =>
                      item.code.toLocaleLowerCase("fr") ===
                      String(line.search).toLocaleLowerCase("fr"),
                  );
                  return (
                    <tr key={line.id}>
                      <td data-label="Code" className="receipt-code">
                        {product?.code || (
                          <Field
                            label="Code produit"
                            value={line.search}
                            onChange={(value) => onLine(index, "search", value)}
                            required
                          />
                        )}
                      </td>
                      <td data-label="Produit">
                        <strong>
                           {product ? product.brand || productName(product) : "Produit à choisir"}
                        </strong>
                        <input
                          className="receipt-note"
                          aria-label={`Note de la ligne ${index + 1}`}
                          placeholder="Note de ligne"
                          value={line.note || ""}
                          onChange={(event) =>
                            onLine(index, "note", event.target.value)
                          }
                        />
                      </td>
                      <td data-label="Variante">{product?.variant || "—"}</td>
                      <td data-label="Format">
                        {product?.format || product?.volume || "—"}
                      </td>
                      <td data-label="Caisses">
                        <Field
                          label={`Caisses, ligne ${index + 1}`}
                          type="number"
                          min="1"
                          step="1"
                          value={line.cases}
                          onChange={(value) => onLine(index, "cases", value)}
                          required
                        />
                      </td>
                      <td data-label="Coût/caisse">
                        <Field
                          label={`Coût par caisse, ligne ${index + 1}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.casePrice}
                          onChange={(value) =>
                            onLine(index, "casePrice", value)
                          }
                          required
                        />
                      </td>
                      <td
                        data-label="Total ligne"
                        className="receipt-line-total"
                      >
                        {money(
                          Number(line.cases || 0) * Number(line.casePrice || 0),
                        )}
                      </td>
                      <td className="receipt-remove">
                        <button
                          type="button"
                          className="icon-button danger"
                          aria-label={`Retirer la ligne ${index + 1}`}
                          onClick={() => onDeleteLine(index)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!fields.lines.length && (
              <Empty text="Aucun produit sélectionné. Utilise la recherche pour ajouter une ligne." />
            )}
          </div>
        </section>
      )}
      <footer className="document-editor-footer">
        <div className="document-editor-footer-fields">
          <Field label={isOrder ? "Date du bon" : "Date de réception"} type="date" value={fields.date} onChange={(value) => onField("date", value)} disabled={readOnly} required />
          <Field label={isOrder ? "N° PO" : "N° facture"} value={fields.number} onChange={(value) => onField("number", value)} disabled={readOnly} required={!isEditing} />
        </div>
        <div className="document-editor-totals">
          <span>
            {fields.lines.length} produit(s) · {selectedCases} caisse(s)
          </span>
          <strong>
            Total {isOrder ? "prévu" : "facture"} : {money(total)}
          </strong>
        </div>
        {error && (
          <div className="form-error" role="alert">
            <AlertTriangle size={17} />
            {error}
          </div>
        )}
        <div className="document-editor-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Retour
          </button>
          {isOrder ? (
            <>
              {fields.stage === "draft" && (
                <>
                  <button type="submit" value="save" className="secondary">
                    Enregistrer le brouillon
                  </button>
                  <button type="submit" value="command" className="primary">
                    Commander
                  </button>
                </>
              )}
              {fields.stage === "ordered" && (
                <>
                  <button type="submit" value="save" className="secondary">
                    Enregistrer
                  </button>
                  {isEditing && remaining > 0 && (
                    <button type="submit" value="receive" className="primary">
                      Recevoir
                    </button>
                  )}
                  {isEditing && !order?.receivedInvoices.length && (
                    <button
                      type="button"
                      className="delete-button"
                      onClick={onCancelOrder}
                    >
                      Annuler la commande
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <button type="submit" value="save" className="primary">
              <Check size={17} /> Enregistrer la réception
            </button>
          )}
        </div>
      </footer>
    </form>
  );
}

function SearchCombobox({
  label,
  value,
  onChange,
  items,
  itemLabel,
  onPick,
  onCreate,
  createLabel,
  preventEnterSubmit = false,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = React.useId();
  const keyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) =>
        Math.max(
          0,
          Math.min(
            items.length,
            current + (event.key === "ArrowDown" ? 1 : -1),
          ),
        ),
      );
    }
    if (event.key === "Enter" && preventEnterSubmit && !value.trim()) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" && (open || preventEnterSubmit)) {
      event.preventDefault();
      if (active < items.length) onPick(items[active]);
      else onCreate();
      setOpen(false);
    }
  };
  return (
    <div className="document-combobox">
      <label htmlFor={id}>{label}</label>
      <div className="document-combobox-input">
        <Search size={17} />
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={keyDown}
          disabled={disabled}
          placeholder={label}
        />
      </div>
      {open && !disabled && (
        <div
          id={`${id}-list`}
          className="document-combobox-menu"
          role="listbox"
        >
          {items.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={active === index}
              key={item.id || item.code}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onPick(item);
                setOpen(false);
              }}
            >
              {itemLabel(item)}
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={active === items.length}
            className="document-combobox-create"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onCreate();
              setOpen(false);
            }}
          >
            <Plus size={15} />
            {createLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </label>
  );
}
const finiteFilters = {
  produits: ["category"],
  variantes: ["variant"],
  catalogVariants: ["brand", "product", "variant", "format", "publicationStatus"],
  fournisseurs: ["name"],
  clients: ["name"],
  commandes: ["supplierName", "status"],
  receptions: ["supplier"],
  ventes: ["customerName", "status"],
  depenses: ["category"],
};
const normalizeTableFilters = (filters, kind) =>
  filters.map((filter) =>
    finiteFilters[kind]?.includes(filter.id)
      ? {
          ...filter,
          value: Array.isArray(filter.value) ? filter.value : [filter.value],
        }
      : filter,
  );
function DataTable({
  kind,
  data,
  columns,
  emptyText,
  initialSort = [],
  details,
  selectionActions,
}) {
  const { drawer, closeDrawer, showTableDrawer } = useContext(DrawerContext);
  const [initialQuery] = useState(() =>
    readTableQuery(window.location.search, columns, initialSort),
  );
  const [sorting, setSorting] = useState(initialQuery.sorting);
  const [globalFilter, setGlobalFilter] = useState(initialQuery.globalFilter);
  const [columnFilters, setColumnFilters] = useState(() =>
    normalizeTableFilters(initialQuery.columnFilters, kind),
  );
  const [columnVisibility, setColumnVisibility] = useState(
    initialQuery.columnVisibility,
  );
  const [pagination, setPagination] = useState(initialQuery.pagination);
  const [rowSelection, setRowSelection] = useState({});
  const drawerMode =
    drawer?.owner === "table" && drawer.kind === kind ? drawer.mode : null;
  const drawerOpen = Boolean(drawerMode && drawer.open);
  const [expanded, setExpanded] = useState([]);
  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId: (row) => String(row.id || row.code),
    enableRowRangeSelection: false,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    defaultColumn: { filterFn: textColumnFilter },
    globalFilterFn: searchAcrossRow,
  });
  useEffect(() => {
    const restore = () => {
      const query = readTableQuery(
        window.location.search,
        columns,
        initialSort,
      );
      setSorting(query.sorting);
      setGlobalFilter(query.globalFilter);
      setColumnFilters(normalizeTableFilters(query.columnFilters, kind));
      setColumnVisibility(query.columnVisibility);
      setPagination(query.pagination);
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("app:navigate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("app:navigate", restore);
    };
  }, [kind]);
  useEffect(() => {
    const query = writeTableQuery(window.location.search, {
      sorting,
      globalFilter,
      columnFilters,
      columnVisibility,
      pagination,
    });
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (
      `${window.location.pathname}${window.location.search}${window.location.hash}` !==
      next
    )
      window.history.replaceState(window.history.state, "", next);
  }, [sorting, globalFilter, columnFilters, columnVisibility, pagination]);
  useEffect(() => {
    const lastPage = Math.max(0, table.getPageCount() - 1);
    if (pagination.pageIndex > lastPage)
      setPagination((current) => ({ ...current, pageIndex: lastPage }));
  }, [data, sorting, globalFilter, columnFilters, pagination.pageIndex]);
  const rows = table.getRowModel().rows;
  const filteredRows = table
    .getFilteredRowModel()
    .flatRows.filter((row) => row.getCanSelect());
  const allFilteredSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => rowSelection[row.id]);
  const someFilteredSelected = filteredRows.some((row) => rowSelection[row.id]);
  const selectedItems = selectedRows(data, rowSelection);
  const dataColumns = table
    .getAllLeafColumns()
    .filter((column) => column.accessorFn);
  const visibleDataColumns = dataColumns.filter((column) =>
    column.getIsVisible(),
  );
  const filterCount = columnFilters.length;
  const finiteColumn = (column) => finiteFilters[kind]?.includes(column.id);
  const filterOptions = (column) =>
    [
      ...new Set(
        data
          .map((row) => String(column.accessorFn(row, 0) ?? ""))
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "fr"));
  const toggleFilteredSelection = (checked) =>
    setRowSelection((current) =>
      updateFilteredSelection(current, filteredRows, checked),
    );
  const exportSelection = () => {
    if (!selectedItems.length) return;
    const visibleColumns = visibleDataColumns.map((column) => ({
      id: column.id,
      header: String(column.columnDef.header),
    }));
    downloadCsv(
      selectedTableRows(kind, selectedItems, visibleColumns),
      `ks-${kind}-selection-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };
  const toggleDrawer = (mode) => {
    if (drawerOpen && drawerMode === mode) closeDrawer();
    else showTableDrawer(kind, mode);
  };
  const drawerTarget = document.getElementById("drawer-slot");
  return (
    <div className={`data-table data-table-${kind}`}>
      <div className="table-toolbar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Rechercher dans le tableau"
            value={globalFilter}
            onChange={(event) => {
              setGlobalFilter(event.target.value);
              setPagination((current) => ({ ...current, pageIndex: 0 }));
            }}
            placeholder="Rechercher dans le tableau…"
          />
        </label>
        <div className="table-tools">
          <button
            type="button"
            className="secondary"
            onClick={() => toggleDrawer("filters")}
            aria-expanded={drawerOpen && drawerMode === "filters"}
          >
            <Filter size={16} /> Filtres{filterCount ? ` (${filterCount})` : ""}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => toggleDrawer("columns")}
            aria-expanded={drawerOpen && drawerMode === "columns"}
          >
            <Eye size={16} /> Colonnes
          </button>
        </div>
      </div>
      <div className="selection-tools">
        <span>
          {selectedItems.length} ligne{selectedItems.length > 1 ? "s" : ""}{" "}
          sélectionnée{selectedItems.length > 1 ? "s" : ""}
        </span>
        <div>
          {selectionActions && selectedItems.length > 0 && selectionActions(selectedItems, () => setRowSelection({}))}
          <button
            type="button"
            className="text-button"
            disabled={!selectedItems.length}
            onClick={() => setRowSelection({})}
          >
            Tout désélectionner
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!selectedItems.length}
            onClick={exportSelection}
          >
            <Download size={15} /> Exporter la sélection
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                <th>
                  <input
                    type="checkbox"
                    className="row-checkbox"
                    aria-label="Sélectionner tous les résultats filtrés"
                    checked={allFilteredSelected}
                    disabled={!filteredRows.length}
                    ref={(node) => {
                      if (node)
                        node.indeterminate =
                          someFilteredSelected && !allFilteredSelected;
                    }}
                    onChange={(event) =>
                      toggleFilteredSelection(event.target.checked)
                    }
                  />
                </th>
                {details && <th>Voir</th>}
                {group.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className="sort-button"
                        disabled={!header.column.getCanSort()}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getIsSorted() === "asc"
                          ? " ↑"
                          : header.column.getIsSorted() === "desc"
                            ? " ↓"
                            : ""}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <React.Fragment key={row.id}>
                <tr>
                  <td>
                    <input
                      type="checkbox"
                      className="row-checkbox"
                      aria-label={`Sélectionner la ligne ${row.id}`}
                      checked={row.getIsSelected()}
                      onChange={row.getToggleSelectedHandler()}
                    />
                  </td>
                  {details && (
                    <td>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={
                          expanded.includes(row.id)
                            ? "Masquer les produits"
                            : "Voir les produits"
                        }
                        aria-expanded={expanded.includes(row.id)}
                        onClick={() =>
                          setExpanded((current) =>
                            current.includes(row.id)
                              ? current.filter((id) => id !== row.id)
                              : [...current, row.id],
                          )
                        }
                      >
                        {expanded.includes(row.id) ? "−" : "+"}
                      </button>
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
                {details && expanded.includes(row.id) && (
                  <tr className="detail-row">
                    <td colSpan={row.getVisibleCells().length + 2}>
                      {details(row.original)}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty text={emptyText} />}
      <div className="table-pagination">
        <span>
          {table.getFilteredRowModel().rows.length} résultat(s) · Page{" "}
          {table.state.pagination.pageIndex + 1} /{" "}
          {Math.max(1, table.getPageCount())}
        </span>
        <div>
          <button
            type="button"
            className="secondary"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Précédent
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Suivant
          </button>
        </div>
      </div>
      {drawerMode &&
        drawerTarget &&
        createPortal(
          <>
            <div
              className={`drawer-backdrop${drawerOpen ? " is-open" : ""}`}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeDrawer();
              }}
            />
            <aside
              className={`table-drawer drawer-pane${drawerOpen ? " is-open" : ""}`}
              inert={!drawerOpen}
              aria-hidden={!drawerOpen}
              aria-label={
                drawerMode === "filters"
                  ? "Filtres du tableau"
                  : "Colonnes du tableau"
              }
            >
              <div className="table-drawer-head">
                <div>
                  <span className="eyebrow">TABLEAU</span>
                  <h2>
                    {drawerMode === "filters" ? "Filtres" : "Colonnes visibles"}
                  </h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Fermer le panneau"
                  onClick={closeDrawer}
                >
                  <X size={19} />
                </button>
              </div>
              {drawerMode === "filters" ? (
                <>
                  <p>Les filtres se combinent avec la recherche du tableau.</p>
                  <div className="table-drawer-fields">
                    {dataColumns
                      .filter((column) => column.getCanFilter())
                      .map((column) =>
                        finiteColumn(column) ? (
                          <MultiSelect
                            key={column.id}
                            label={String(column.columnDef.header)}
                            options={filterOptions(column)}
                            value={column.getFilterValue()}
                            onChange={(values) => {
                              column.setFilterValue(
                                values.length ? values : undefined,
                              );
                              setPagination((current) => ({
                                ...current,
                                pageIndex: 0,
                              }));
                            }}
                          />
                        ) : (
                          <label className="field" key={column.id}>
                            <span>{String(column.columnDef.header)}</span>
                            <input
                              value={column.getFilterValue() ?? ""}
                              onChange={(event) => {
                                column.setFilterValue(event.target.value);
                                setPagination((current) => ({
                                  ...current,
                                  pageIndex: 0,
                                }));
                              }}
                              placeholder="Filtrer…"
                            />
                          </label>
                        ),
                      )}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!filterCount}
                    onClick={() => {
                      setColumnFilters([]);
                      setPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }));
                    }}
                  >
                    Effacer les filtres
                  </button>
                </>
              ) : (
                <>
                  <p>
                    Choisis les colonnes à afficher dans le tableau et l’export
                    de la sélection.
                  </p>
                  <div className="table-column-list">
                    {dataColumns.map((column) => (
                      <label key={column.id}>
                        <input
                          type="checkbox"
                          checked={column.getIsVisible()}
                          disabled={
                            column.getIsVisible() &&
                            visibleDataColumns.length === 1
                          }
                          onChange={(event) =>
                            column.toggleVisibility(event.target.checked)
                          }
                        />
                        <span>{String(column.columnDef.header)}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => table.toggleAllColumnsVisible(true)}
                  >
                    Tout afficher
                  </button>
                </>
              )}
            </aside>
          </>,
          drawerTarget,
        )}
    </div>
  );
}
function SelectField({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const [id, text] = Array.isArray(option) ? option : [option, option];
          return (
            <option key={id} value={id}>
              {text || "Non précisé"}
            </option>
          );
        })}
      </select>
    </label>
  );
}
function EntitySelect({
  label,
  value,
  onChange,
  rows,
  required = false,
  disabled = false,
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
      >
        <option value="">{required ? "Choisir…" : "Aucun"}</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Metric({ icon, label, value, detail }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
