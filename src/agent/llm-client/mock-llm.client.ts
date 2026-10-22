import { ILLMClient, LLMNextStepDecision } from './llm.interface.js';
import { AgentStepTrace, ToolDefinition } from '../agent.types.js';

export class MockLlmClient implements ILLMClient {
  readonly providerName = 'Deterministic-Mock-Engine';

  async generateNextStep(context: {
    systemPrompt: string;
    query: string;
    steps: AgentStepTrace[];
    availableTools: ToolDefinition[];
  }): Promise<LLMNextStepDecision> {
    const { query, steps } = context;
    const lowerQuery = query.toLowerCase();
    const turn = steps.length + 1;

    // SCENARIO 1: Order ORD-9821 with Deadlock & Overbooking
    if (lowerQuery.includes('9821') || lowerQuery.includes('müller') || (lowerQuery.includes('lieferung') && lowerQuery.includes('verzöger'))) {
      if (turn === 1) {
        return {
          thought: 'Der Kunde erkundigt sich nach Auftrag ORD-9821. Zur Beantwortung prüfe ich zunächst den aktuellen Auftragsstatus, die Positionen und den ERP-Sync-Status in der Datenbank.',
          action: {
            toolName: 'lookup_order_status',
            input: { orderId: 'ORD-9821' }
          }
        };
      }
      if (turn === 2) {
        return {
          thought: 'Auftrag ORD-9821 befindet sich im Status ON_HOLD mit erp_sync_status=ERROR. Betroffener Artikel ist SKU-7740. Zur Ursachenforschung prüfe ich die Sync-Fehlerprotokolle für diesen Auftrag.',
          action: {
            toolName: 'analyze_erp_sync_error',
            input: { entityId: 'ORD-9821' }
          }
        };
      }
      if (turn === 3) {
        return {
          thought: 'Das Fehlerprotokoll meldet ERR_SQL_DEADLOCK_40001 (Transaktionskonflikt bei der Bestandsbuchung). Nun prüfe ich die physischen und reservierten Lagerbestände von SKU-7740.',
          action: {
            toolName: 'check_inventory_and_supplier_feed',
            input: { sku: 'SKU-7740' }
          }
        };
      }
      if (turn === 4) {
        return {
          thought: 'Kritische Feststellung: Bei SKU-7740 liegt eine Bestandsüberbuchung vor (Physical: 10, Reserved: 14, Fehlmenge: 4). Die nächste Lieferantenanlieferung (20 Stück) trifft am 25.10.2026 ein. Das Problem erfordert ein 2nd-Level-Ticket mit einem bereinigten SQL-Korrektur-Patch.',
          action: {
            toolName: 'escalate_to_2nd_level',
            input: {
              customerQuery: query,
              diagnosis: 'Auftrag ORD-9821 durch ERR_SQL_DEADLOCK blockiert. Bestandsdiskrepanz bei SKU-7740 (physisch 10, reserviert 14). Korrektur der Reservierung auf 10 erforderlich.',
              sqlPatchSuggestion: "UPDATE inventory SET reserved_stock = 10 WHERE sku = 'SKU-7740'",
              source: 'WEB_CHAT'
            }
          }
        };
      }
      return {
        thought: 'Alle Untersuchungen und Aktionen sind erfolgreich abgeschlossen. Ich formuliere nun die umfassende Abschlussanalyse.',
        finalAnswer: `### Diagnose & Lösung für Auftrag ORD-9821

**1. Situationsanalyse:**
- **Auftrag:** ORD-9821 (Kunde: Spedition Müller GmbH & Co. KG)
- **Status:** **ON_HOLD** (ERP-Sync: \`ERROR\`)
- **Artikel:** 4x \`SKU-7740\` (Knorr-Bremse Bremszylinder MB Actros)

**2. Ursachenanalyse (Root Cause):**
- In den ERP-Sync-Logs wurde der Fehler **\`ERR_SQL_DEADLOCK_40001\`** festgestellt. Zwei parallele Prozesse haben zeitgleich auf den Bestandsdatensatz zugegriffen.
- Bei \`SKU-7740\` liegt eine **Bestandsüberbuchung** vor: Physischer Bestand beträgt **10 Stück**, das System hat jedoch **14 Stück reserviert** (Verfügbar: -4).

**3. Eingeleitete Maßnahmen:**
- Ein **2nd-Level-Eskalationsticket** wurde automatisch erstellt (Ticket-Status: \`IN_REVIEW\`).
- Ein validierter SQL-Patch zur Korrektur der Reservierung wurde vorgeschlagen:
  \`\`\`sql
  UPDATE inventory SET reserved_stock = 10 WHERE sku = 'SKU-7740'
  \`\`\`
- **Lieferanten-Zulauf:** Nächste Anlieferung von 20 Stück trifft planmäßig am **25.10.2026** ein.`
      };
    }

    // SCENARIO 2: Order ORD-4412 (Normal Shipped Status)
    if (lowerQuery.includes('4412') || lowerQuery.includes('logistik partner') || (lowerQuery.includes('tracking') && !lowerQuery.includes('9821'))) {
      if (turn === 1) {
        return {
          thought: 'Der Kunde möchte Informationen zu Auftrag ORD-4412 bzw. dessen Sendungsverfolgung. Ich rufe die Bestelldaten aus dem ERP ab.',
          action: {
            toolName: 'lookup_order_status',
            input: { orderId: 'ORD-4412' }
          }
        };
      }
      return {
        thought: 'Die Auftragsdaten liegen vor. Der Auftrag ist bereits versendet und der Sync-Status ist fehlerfrei. Ich gebe dem Kunden die Sendungsinformationen.',
        finalAnswer: `### Statusauskunft für Auftrag ORD-4412

- **Kunde:** Logistik Partner AG Hamburg
- **Status:** **SHIPPED** (ERP-Sync: \`SYNCED\`)
- **Artikel:** 6x \`SKU-1022\` (Bosch Common-Rail Injektor CR-04)
- **Gesamtbetrag:** 1.920,00 €
- **Versanddienstleister:** DHL Freight
- **Tracking-Nummer:** \`DHL-DE-9938210481\`

Die Sendung ist bereits unterwegs und kann über das DHL-Portal verfolgt werden.`
      };
    }

    // SCENARIO 3: Direct Inventory Inquiry (e.g. SKU-7740)
    if (lowerQuery.includes('sku-7740') || (lowerQuery.includes('bestand') && lowerQuery.includes('bremszylinder'))) {
      if (turn === 1) {
        return {
          thought: 'Es wurde nach dem Lagerbestand von SKU-7740 gefragt. Ich prüfe die Bestände, Reservierungen und Zuläufe.',
          action: {
            toolName: 'check_inventory_and_supplier_feed',
            input: { sku: 'SKU-7740' }
          }
        };
      }
      if (turn === 2) {
        return {
          thought: 'Bei SKU-7740 liegt eine Überbuchung vor. Ich prüfe, ob Fehlerprotokolle für diese SKU vorliegen.',
          action: {
            toolName: 'analyze_erp_sync_error',
            input: { entityId: 'SKU-7740' }
          }
        };
      }
      return {
        thought: 'Die Bestandsdaten und Fehlerprotokolle wurden erhoben. Ich formuliere die Bestandsübersicht.',
        finalAnswer: `### Lagerbestandsbericht für SKU-7740 (Knorr-Bremse Bremszylinder)

- **Lagerfach:** \`H-03-12\`
- **Physischer Bestand:** 10 Stück
- **Reservierter Bestand:** 14 Stück
- **Verfügbarer Bestand:** **-4 Stück (KRITISCHE ÜBERBUCHUNG)**
- **Mindestbestand:** 5 Stück
- **Fehlerprotokoll:** \`ERR_INVENTORY_NEGATIVE_RESERVATION\`
- **Nächster Wareneingang:** 20 Stück am **25.10.2026**`
      };
    }

    // SCENARIO 4: Sync Error / EAN Checksum
    if (lowerQuery.includes('ean') || lowerQuery.includes('checksum') || lowerQuery.includes('prüfsumme') || lowerQuery.includes('shopware')) {
      if (turn === 1) {
        return {
          thought: 'Es wird ein Fehler beim Katalogexport bzw. EAN-Prüfsummenfehler gemeldet. Ich prüfe die entsprechenden Fehlerlogs.',
          action: {
            toolName: 'analyze_erp_sync_error',
            input: { errorCode: 'ERR_INVALID_EAN_CHECK_SUM' }
          }
        };
      }
      if (turn === 2) {
        return {
          thought: 'Der Fehler betrifft SKU-5501 mit EAN 4012345678901. Ich eskaliere das Problem an den 2nd-Level-Support.',
          action: {
            toolName: 'escalate_to_2nd_level',
            input: {
              customerQuery: query,
              diagnosis: 'Fehler ERR_INVALID_EAN_CHECK_SUM bei SKU-5501. GS1 Modulo-10 Prüfziffer stimmt nicht mit EAN 4012345678901 überein.',
              source: 'WEB_CHAT'
            }
          }
        };
      }
      return {
        thought: 'Die Analyse ist abgeschlossen.',
        finalAnswer: `### Diagnose: EAN-Prüfsummenfehler (ERR_INVALID_EAN_CHECK_SUM)

- **Betroffener Artikel:** SKU-5501 (Valeo Drehstrom-Lichtmaschine 28V 100A HD)
- **Fehlerursache:** Die hinterlegte EAN \`4012345678901\` schlägt bei der Modulo-10-Prüfziffernberechnung fehl.
- **Maßnahme:** Ticket an den 2nd-Level-Stammdaten-Support übermittelt zur Korrektur der GS1-Prüfziffer.`
      };
    }

    // Dynamic Generic Matcher: Extract order or SKU from query
    const orderMatch = query.match(/\b(ORD-\d+)\b/i);
    const skuMatch = query.match(/\b(SKU-\d+)\b/i);

    if (orderMatch && turn === 1) {
      const orderId = orderMatch[1].toUpperCase();
      return {
        thought: `In der Anfrage wurde die Auftragsnummer ${orderId} identifiziert. Ich rufe den Auftragsstatus ab.`,
        action: {
          toolName: 'lookup_order_status',
          input: { orderId }
        }
      };
    }

    if (skuMatch && turn === 1) {
      const sku = skuMatch[1].toUpperCase();
      return {
        thought: `In der Anfrage wurde die Artikelnummer ${sku} identifiziert. Ich prüfe den Lagerbestand.`,
        action: {
          toolName: 'check_inventory_and_supplier_feed',
          input: { sku }
        }
      };
    }

    // Default Fallback Response
    return {
      thought: 'Die Anfrage ist allgemeiner Natur. Ich gebe eine strukturierte Hilfestellung zu den verfügbaren ERP-Funktionen.',
      finalAnswer: `Ich bin Ihr autonomer ERP & Support Agent. Gerne helfe ich Ihnen bei:
- **Auftragsstatus & Tracking:** z.B. *"Wie ist der Status von ORD-9821?"*
- **Bestandsprüfungen:** z.B. *"Prüfe Bestand von SKU-7740"*
- **ERP-Sync-Fehlerdiagnosen:** z.B. *"Analysiere Fehler ERR_SQL_DEADLOCK_40001"*
- **2nd-Level-Eskalationen & SQL-Patches**`
    };
  }
}
