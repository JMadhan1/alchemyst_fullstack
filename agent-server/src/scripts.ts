import { ResponseScript } from "./types.js";

export const RESPONSE_SCRIPTS: ResponseScript[] = [
  {
    id: "greeting",
    name: "Simple Greeting",
    triggers: ["hello", "hi", "hey", "greetings", "good morning", "good evening"],
    events: [
      {
        kind: "context",
        context_id: "ctx_session",
        data: {
          session_type: "conversational",
          capabilities: ["search", "analyze", "compute", "summarize"],
          model_version: "alchemyst-agent-v3.1",
        },
      },
      { kind: "token", text: "Hello! " },
      { kind: "token", text: "I'm the " },
      { kind: "token", text: "Alchemyst Agent. " },
      { kind: "token", text: "I can help you " },
      { kind: "token", text: "analyze data, " },
      { kind: "token", text: "look up metrics, " },
      { kind: "token", text: "retrieve context, " },
      { kind: "token", text: "and generate " },
      { kind: "token", text: "reports from " },
      { kind: "token", text: "your connected " },
      { kind: "token", text: "data sources. " },
      { kind: "token", text: "What would you " },
      { kind: "token", text: "like to explore " },
      { kind: "token", text: "today?" },
    ],
  },
  {
    id: "report_summary",
    name: "Report Summary",
    triggers: ["report", "summary", "summarize", "quarterly", "q3", "q4", "earnings"],
    events: [
      {
        kind: "context",
        context_id: "ctx_report",
        data: {
          report: "Q3-2025-Financial",
          pages: 47,
          sections: ["revenue", "operations", "forecast", "risks"],
          last_updated: "2025-10-15T09:30:00Z",
          source: "internal-docs/finance/quarterly",
          access_level: "confidential",
        },
      },
      { kind: "token", text: "Based on " },
      { kind: "token", text: "the Q3 financial " },
      { kind: "token", text: "report, the overall " },
      { kind: "token", text: "performance shows " },
      { kind: "token", text: "strong growth " },
      { kind: "token", text: "across key metrics. " },
      { kind: "token", text: "Revenue grew " },
      {
        kind: "tool_call",
        tool_name: "lookup_metric",
        args: { metric: "revenue_yoy", quarter: "Q3-2025" },
        result: { value: "23.4%", period: "YoY", raw_amount: 4250000, currency: "USD" },
      },
      { kind: "token", text: "23.4% year-over-year, " },
      { kind: "token", text: "reaching $4.25M " },
      { kind: "token", text: "for the quarter. " },
      { kind: "token", text: "This growth was " },
      { kind: "token", text: "primarily driven by " },
      { kind: "token", text: "enterprise client " },
      { kind: "token", text: "expansion, with the " },
      { kind: "token", text: "top 10 accounts " },
      { kind: "token", text: "contributing 68% " },
      { kind: "token", text: "of new ARR. " },
      {
        kind: "context",
        context_id: "ctx_report",
        data: {
          report: "Q3-2025-Financial",
          pages: 47,
          sections: ["revenue", "operations", "forecast", "risks"],
          last_updated: "2025-10-15T09:30:00Z",
          source: "internal-docs/finance/quarterly",
          access_level: "confidential",
          current_focus: "operations",
          extracted_metrics: {
            revenue_yoy: "23.4%",
            operating_margin: "34%",
            prev_operating_margin: "28%",
          },
        },
      },
      { kind: "token", text: "Operating margins " },
      { kind: "token", text: "improved to 34%, " },
      { kind: "token", text: "up from 28% in Q2, " },
      { kind: "token", text: "largely due to " },
      { kind: "token", text: "infrastructure cost " },
      { kind: "token", text: "optimization and " },
      { kind: "token", text: "the migration to " },
      { kind: "token", text: "spot instances for " },
      { kind: "token", text: "non-critical workloads. " },
      { kind: "token", text: "The forecast section " },
      { kind: "token", text: "indicates continued " },
      { kind: "token", text: "momentum, with Q4 " },
      { kind: "token", text: "projections suggesting " },
      { kind: "token", text: "a potential 15-18% " },
      { kind: "token", text: "sequential increase." },
    ],
  },
  {
    id: "multi_tool",
    name: "Multi-Tool Analysis",
    triggers: ["analyze", "compare", "correlation", "analysis", "relationship"],
    events: [
      {
        kind: "context",
        context_id: "ctx_analysis",
        data: {
          analysis_type: "correlation",
          datasets: ["user_growth", "revenue", "churn"],
          timeframe: "2024-01 to 2025-09",
          requested_by: "product-team",
        },
      },
      { kind: "token", text: "Let me analyze " },
      { kind: "token", text: "the relationship " },
      { kind: "token", text: "between your " },
      { kind: "token", text: "key metrics. " },
      {
        kind: "tool_call",
        tool_name: "fetch_dataset",
        args: { dataset: "user_growth", timeframe: "2024-01:2025-09", granularity: "monthly" },
        result: {
          total_records: 2847,
          growth_rate: 0.12,
          trend: "accelerating",
          last_month_delta: 347,
        },
      },
      { kind: "token", text: "User growth data " },
      { kind: "token", text: "shows 2,847 new " },
      { kind: "token", text: "accounts over the " },
      { kind: "token", text: "period with a 12% " },
      { kind: "token", text: "compound monthly " },
      { kind: "token", text: "growth rate. Now " },
      { kind: "token", text: "let me check how " },
      { kind: "token", text: "this correlates " },
      { kind: "token", text: "with revenue. " },
      {
        kind: "tool_call",
        tool_name: "compute_correlation",
        args: { metrics: ["user_growth", "revenue"], method: "pearson" },
        result: {
          correlation: 0.87,
          p_value: 0.001,
          lag_months: 2,
          confidence: "high",
          sample_size: 21,
        },
      },
      { kind: "token", text: "The Pearson " },
      { kind: "token", text: "correlation is 0.87 " },
      { kind: "token", text: "with high confidence " },
      { kind: "token", text: "(p < 0.001), with a " },
      { kind: "token", text: "2-month lag — " },
      { kind: "token", text: "reflecting your " },
      { kind: "token", text: "trial-to-paid " },
      { kind: "token", text: "conversion cycle." },
    ],
  },
  {
    id: "lookup",
    name: "Knowledge Base Lookup",
    triggers: ["look up", "lookup", "find", "search", "what is", "define"],
    events: [
      {
        kind: "tool_call",
        tool_name: "search_knowledge_base",
        args: { query: "deployment SLA requirements", top_k: 3 },
        result: {
          found: true,
          document: "SLA-Framework-v3",
          section: "4.2",
          relevance_score: 0.94,
          content_preview: "Production deployments require 99.95% uptime...",
        },
      },
      {
        kind: "context",
        context_id: "ctx_search",
        data: {
          source_document: "SLA-Framework-v3",
          section: "4.2",
          retrieval_method: "vector_search",
          confidence: 0.94,
        },
      },
      { kind: "token", text: "Based on the " },
      { kind: "token", text: "knowledge base, " },
      { kind: "token", text: "production deployments " },
      { kind: "token", text: "require 99.95% uptime " },
      { kind: "token", text: "with a maximum of " },
      { kind: "token", text: "4.38 hours planned " },
      { kind: "token", text: "downtime per year. " },
      { kind: "token", text: "Critical services " },
      { kind: "token", text: "require 99.99% " },
      { kind: "token", text: "availability. P0 " },
      { kind: "token", text: "incidents require " },
      { kind: "token", text: "acknowledgment " },
      { kind: "token", text: "within 5 minutes." },
    ],
  },
  {
    id: "large_context",
    name: "Large Context Load",
    triggers: ["schema", "database", "large", "context", "full"],
    events: [
      {
        kind: "context",
        context_id: "ctx_schema",
        data: generateLargeContext(),
      },
      { kind: "token", text: "I've loaded the " },
      { kind: "token", text: "full database schema " },
      { kind: "token", text: "into context — " },
      { kind: "token", text: "64 tables across " },
      { kind: "token", text: "4 primary domains. " },
      {
        kind: "tool_call",
        tool_name: "analyze_schema",
        args: { focus: "relationships", depth: "full" },
        result: {
          total_tables: 64,
          total_columns: 412,
          foreign_keys: 67,
          most_connected: "events",
          orphan_tables: ["legacy_logs", "temp_migrations"],
        },
      },
      { kind: "token", text: "The most connected " },
      { kind: "token", text: "table is `events`. " },
      { kind: "token", text: "Found 2 orphan tables " },
      { kind: "token", text: "for cleanup: " },
      { kind: "token", text: "`legacy_logs` and " },
      { kind: "token", text: "`temp_migrations`." },
    ],
  },
  {
    id: "long_response",
    name: "Long Detailed Response",
    triggers: ["long", "detailed", "document", "write", "explain in detail", "comprehensive"],
    events: [
      {
        kind: "context",
        context_id: "ctx_doc",
        data: {
          document_type: "technical_brief",
          topic: "context_engine_architecture",
          audience: "engineering_team",
        },
      },
      { kind: "token", text: "The context engine " },
      { kind: "token", text: "architecture is built " },
      { kind: "token", text: "around three core " },
      { kind: "token", text: "principles: verifiable " },
      { kind: "token", text: "retrieval, persistent " },
      { kind: "token", text: "memory, and sub-200ms " },
      { kind: "token", text: "latency at the p99. " },
      { kind: "token", text: "At its foundation, " },
      { kind: "token", text: "the engine maintains " },
      { kind: "token", text: "a directed acyclic " },
      { kind: "token", text: "graph of context " },
      { kind: "token", text: "nodes, where each " },
      { kind: "token", text: "node represents a " },
      { kind: "token", text: "discrete unit of " },
      { kind: "token", text: "business knowledge " },
      { kind: "token", text: "with provenance " },
      { kind: "token", text: "metadata attached. " },
      {
        kind: "tool_call",
        tool_name: "fetch_architecture_diagram",
        args: { component: "context_engine", format: "summary" },
        result: {
          layers: ["ingestion", "indexing", "retrieval", "caching"],
          throughput: "12k_queries_per_second",
          p99_latency_ms: 187,
          storage_backend: "hybrid_vector_kv",
        },
      },
      { kind: "token", text: "Four layers handle " },
      { kind: "token", text: "the pipeline: ingestion, " },
      { kind: "token", text: "indexing, retrieval, " },
      { kind: "token", text: "and caching. Current " },
      { kind: "token", text: "throughput: 12,000 " },
      { kind: "token", text: "queries/sec with " },
      { kind: "token", text: "p99 latency of 187ms, " },
      { kind: "token", text: "well within the " },
      { kind: "token", text: "sub-200ms target." },
    ],
  },
  {
    id: "default",
    name: "Default Response",
    triggers: [],
    events: [
      {
        kind: "context",
        context_id: "ctx_session",
        data: {
          session_type: "general",
          capabilities: ["search", "analyze", "compute", "summarize"],
          active_sources: ["knowledge_base", "metrics_dashboard", "recent_docs"],
        },
      },
      { kind: "token", text: "I've reviewed " },
      { kind: "token", text: "your request. " },
      {
        kind: "tool_call",
        tool_name: "classify_intent",
        args: { text: "user_query", confidence_threshold: 0.7 },
        result: {
          intent: "general_query",
          confidence: 0.82,
          suggested_tools: ["search_knowledge_base"],
          category: "information_retrieval",
        },
      },
      { kind: "token", text: "Based on my analysis, " },
      { kind: "token", text: "this falls into an " },
      { kind: "token", text: "information retrieval " },
      { kind: "token", text: "category. I can search " },
      { kind: "token", text: "our knowledge base, " },
      { kind: "token", text: "analyze data patterns, " },
      { kind: "token", text: "or compute metrics " },
      { kind: "token", text: "for you. The context " },
      { kind: "token", text: "engine currently has " },
      { kind: "token", text: "access to your " },
      { kind: "token", text: "organization's " },
      { kind: "token", text: "documentation, metrics " },
      { kind: "token", text: "dashboards, and recent " },
      { kind: "token", text: "communication logs. " },
      { kind: "token", text: "What specific aspect " },
      { kind: "token", text: "would you like me " },
      { kind: "token", text: "to dig into?" },
    ],
  },
];

function generateLargeContext(): Record<string, unknown> {
  const tables: Record<string, unknown>[] = [];
  const domains = ["user_management", "billing", "analytics", "agent_ops"];
  const columnTypes = [
    "uuid", "varchar(255)", "text", "integer", "bigint",
    "boolean", "timestamp with time zone", "jsonb", "float8", "inet",
    "cidr", "macaddr", "bytea", "numeric(12,4)", "interval",
  ];
  const indexTypes = ["btree", "hash", "gin", "gist", "brin"];

  for (let i = 0; i < 64; i++) {
    const domain = domains[i % domains.length]!;
    const tableName = `${domain}_table_${i}`;
    const columns: Record<string, unknown>[] = [];
    const numColumns = 10 + (i % 8);

    for (let c = 0; c < numColumns; c++) {
      const colNames = ["id","name","status","created_at","updated_at","value","ref_id","metadata","score","flags","email","config","payload","version","checksum","priority","tags"];
      const indices: Record<string, unknown>[] = [];
      if (c < 3 || c % 4 === 0) {
        indices.push({
          name: `idx_${tableName}_${colNames[c % colNames.length]}`,
          type: indexTypes[c % indexTypes.length],
          unique: c === 0,
          size_mb: Math.round((10 + Math.random() * 200) * 100) / 100,
        });
      }
      const constraints: Record<string, unknown>[] = [];
      if (c === 0) constraints.push({ type: "PRIMARY KEY" });
      if (c < 3) constraints.push({ type: "NOT NULL" });
      if (c % 6 === 0 && c > 0) {
        constraints.push({
          type: "REFERENCES",
          target_table: `${domains[(i + 1) % domains.length]}_table_${(i + c) % 64}`,
          on_delete: c % 2 === 0 ? "CASCADE" : "SET NULL",
        });
      }
      columns.push({
        name: `col_${c}_${colNames[c % colNames.length]}`,
        type: columnTypes[c % columnTypes.length],
        nullable: c > 2,
        indices,
        constraints,
        statistics: {
          null_fraction: c > 2 ? Math.round(Math.random() * 0.3 * 1000) / 1000 : 0,
          avg_width_bytes: 8 + (c % 5) * 32,
          n_distinct: c === 0 ? -1 : Math.floor(100 + Math.random() * 50000),
        },
      });
    }

    tables.push({
      name: tableName,
      schema: "public",
      domain,
      columns,
      row_count_estimate: 1000 + i * 5000,
      total_size_mb: Math.round((10 + i * 50 + Math.random() * 500) * 100) / 100,
      last_vacuum: "2025-09-15T03:00:00Z",
      partitioned: i % 8 === 0,
    });
  }

  return {
    schema_version: "4.7.2",
    database: "alchemyst_production",
    engine: "PostgreSQL 16.1",
    total_tables: tables.length,
    total_size_gb: 234.7,
    domains,
    extensions: ["pg_trgm", "uuid-ossp", "pgcrypto", "postgis", "pg_stat_statements"],
    tables,
  };
}

export function selectScript(userMessage: string): ResponseScript {
  const lower = userMessage.toLowerCase();
  for (const script of RESPONSE_SCRIPTS) {
    if (script.triggers.length === 0) continue;
    for (const trigger of script.triggers) {
      if (lower.includes(trigger)) return script;
    }
  }
  const defaultScript = RESPONSE_SCRIPTS.find((s) => s.id === "default");
  if (!defaultScript) throw new Error("No default script found");
  return defaultScript;
}
