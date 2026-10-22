function erpApp() {
  return {
    provider: 'mock',
    isLoading: false,
    isPatching: false,
    showInfoModal: false,
    activeGuideTab: 'overview',
    inputQuery: '',
    activeSessionId: null,
    activeTab: 'tickets',
    
    chatHistory: [],
    currentSteps: [],
    
    inventory: [],
    orders: [],
    syncErrors: [],
    tickets: [],

    async initApp() {
      await this.refreshErpData();
    },

    setProvider(p) {
      this.provider = p;
    },

    async refreshErpData() {
      try {
        const [invRes, ordRes, errRes, tckRes] = await Promise.all([
          fetch('/api/erp/inventory'),
          fetch('/api/erp/orders'),
          fetch('/api/erp/errors'),
          fetch('/api/erp/tickets')
        ]);

        if (invRes.ok) this.inventory = await invRes.json();
        if (ordRes.ok) this.orders = await ordRes.json();
        if (errRes.ok) this.syncErrors = await errRes.json();
        if (tckRes.ok) this.tickets = await tckRes.json();
      } catch (e) {
        console.error('Failed to load ERP data:', e);
      }
    },

    async resetDatabase() {
      if (!confirm('Möchtest du die ERP-Datenbank wirklich auf den ursprünglichen Zustand zurücksetzen?')) {
        return;
      }
      try {
        const res = await fetch('/api/erp/reset', { method: 'POST' });
        if (res.ok) {
          await this.refreshErpData();
          this.currentSteps = [];
          this.chatHistory = [];
          this.activeSessionId = null;
          alert('Datenbank erfolgreich zurückgesetzt!');
        }
      } catch (e) {
        alert('Fehler beim Zurücksetzen: ' + e.message);
      }
    },

    async runScenario(scenarioId) {
      this.isLoading = true;
      const scenarioTitles = {
        scenario_1_overbooking: 'Lieferverzögerung bei Auftrag ORD-9821 analysieren und beheben.',
        scenario_2_tracking: 'Sendungsstatus und Tracking für Auftrag ORD-4412 abfragen.',
        scenario_3_inventory: 'Lagerbestand und Lieferanten-ETA für SKU-7740 prüfen.',
        scenario_4_ean: 'Synchronisationsfehler ERR_INVALID_EAN_CHECK_SUM diagnostizieren.'
      };

      const prompt = scenarioTitles[scenarioId] || 'Szenario ausführen';

      this.chatHistory.push({
        role: 'user',
        content: prompt,
        time: new Date().toLocaleTimeString()
      });

      this.scrollToBottom();

      try {
        const res = await fetch('/api/agent/scenario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenarioId })
        });

        const data = await res.json();
        this.handleAgentResponse(data);
      } catch (err) {
        this.chatHistory.push({
          role: 'assistant',
          content: '⚠️ Fehler bei der Ausführung des Agenten: ' + err.message,
          time: new Date().toLocaleTimeString()
        });
      } finally {
        this.isLoading = false;
        await this.refreshErpData();
        this.scrollToBottom();
      }
    },

    async sendMessage() {
      if (!this.inputQuery.trim() || this.isLoading) return;

      const query = this.inputQuery.trim();
      this.inputQuery = '';
      this.isLoading = true;

      this.chatHistory.push({
        role: 'user',
        content: query,
        time: new Date().toLocaleTimeString()
      });

      this.scrollToBottom();

      try {
        const res = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            sessionId: this.activeSessionId,
            provider: this.provider
          })
        });

        const data = await res.json();
        this.handleAgentResponse(data);
      } catch (err) {
        this.chatHistory.push({
          role: 'assistant',
          content: '⚠️ Verbindungsfehler zum Agenten: ' + err.message,
          time: new Date().toLocaleTimeString()
        });
      } finally {
        this.isLoading = false;
        await this.refreshErpData();
        this.scrollToBottom();
      }
    },

    handleAgentResponse(data) {
      if (!data) return;

      this.activeSessionId = data.sessionId;
      this.currentSteps = data.steps || [];

      this.chatHistory.push({
        role: 'assistant',
        content: data.finalAnswer,
        metrics: data.metrics,
        time: new Date().toLocaleTimeString()
      });

      if (data.escalationTicketId) {
        this.activeTab = 'tickets';
      }
    },

    async applyPatch(ticketId) {
      this.isPatching = true;
      try {
        const res = await fetch(`/api/erp/tickets/${ticketId}/apply-patch`, {
          method: 'POST'
        });

        const result = await res.json();

        if (res.ok) {
          alert(`Erfolg: ${result.message}\n\nAusgeführtes SQL:\n${result.executedSql}`);
          await this.refreshErpData();
        } else {
          alert(`Fehler: ${result.error}`);
        }
      } catch (err) {
        alert(`Netzwerkfehler: ${err.message}`);
      } finally {
        this.isPatching = false;
      }
    },

    renderMarkdown(text) {
      if (!text) return '';
      // Simple and safe client-side markdown formatter for bullets, bold, and code blocks
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Triple backticks code block
      html = html.replace(/```(sql|json|text)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre class="bg-slate-950 p-2.5 rounded border border-slate-800 text-amber-300 font-mono text-[11px] my-2 overflow-x-auto"><code>${code.trim()}</code></pre>`;
      });

      // Inline code
      html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-900 px-1 py-0.5 rounded text-indigo-300 font-mono text-[11px] border border-slate-700/60">$1</code>');

      // Bold
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');

      // Headings
      html = html.replace(/^### (.*$)/gim, '<h4 class="text-sm font-bold text-white mt-2 mb-1">$1</h4>');
      html = html.replace(/^## (.*$)/gim, '<h3 class="text-base font-bold text-white mt-3 mb-1">$1</h3>');

      // Unordered lists
      html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-slate-300 my-0.5">$1</li>');

      return html;
    },

    scrollToBottom() {
      setTimeout(() => {
        const container = document.getElementById('chatContainer');
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 50);
    }
  };
}
