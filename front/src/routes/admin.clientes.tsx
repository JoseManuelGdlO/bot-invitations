import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import type { SubscriptionPlan } from "@/lib/mock/types";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/clientes")({
  component: AdminClients,
});

interface ClientRow {
  id: string;
  name: string;
  email: string;
  businessName: string;
  phone: string;
  state: string;
  subscriptionStatus: string;
  createdAt: string;
  eventCount: number;
  guestCount: number;
  plan: SubscriptionPlan | null;
}

interface ClientsPage {
  items: ClientRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

function AdminClients() {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = (q = search, nextPage = page) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("search", q.trim());
    params.set("page", String(nextPage));
    params.set("limit", String(PAGE_SIZE));
    const query = `?${params.toString()}`;
    api<ClientsPage>(`/admin/clients${query}`)
      .then((data) => {
        setRows(data.items);
        setPage(data.page);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      })
      .catch(() => toast.error("No se pudieron cargar los clientes"));
  };

  useEffect(() => {
    load("", 1);
    api<SubscriptionPlan[]>("/admin/plans")
      .then(setPlans)
      .catch(() => undefined);
  }, []);

  const patch = async (id: string, body: Record<string, string>) => {
    try {
      const updated = await api<ClientRow>(`/admin/clients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setRows((current) =>
        current.map((row) => (row.id === id ? updated : row)),
      );
      toast.success("Cliente actualizado");
    } catch {
      toast.error("No se pudo actualizar el cliente");
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8 md:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
        Backoffice
      </p>
      <h1 className="mt-1 font-display text-4xl">Clientes</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Negocio, contacto, ubicación, uso y plan de cada wedding planner.
      </p>

      <form
        className="mt-6 flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          load(search, 1);
        }}
      >
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, negocio, correo o estado"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Negocio</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Uso</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Suscripción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.email}</p>
                </TableCell>
                <TableCell>{row.businessName || "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.phone || "—"}
                </TableCell>
                <TableCell>{row.state || "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.eventCount} ev. ·{" "}
                  {row.guestCount.toLocaleString("es-MX")} inv.
                </TableCell>
                <TableCell>
                  <Select
                    value={row.plan?.id || ""}
                    onValueChange={(planId) => patch(row.id, { planId })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Sin plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="rounded-full capitalize"
                    >
                      {row.subscriptionStatus}
                    </Badge>
                    <Select
                      value={row.subscriptionStatus}
                      onValueChange={(subscriptionStatus) =>
                        patch(row.id, { subscriptionStatus })
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Activa</SelectItem>
                        <SelectItem value="pending">Pendiente</SelectItem>
                        <SelectItem value="canceled">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Aún no hay clientes registrados.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {total > 0 ? (
        <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Mostrando {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} de {total.toLocaleString("es-MX")}{" "}
            clientes
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => load(search, page - 1)}
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <span className="min-w-24 text-center text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => load(search, page + 1)}
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
