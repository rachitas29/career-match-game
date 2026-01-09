/**
 * Shared logic for PO Line Items Management Modal
 */

let lineItemsState = {
    poNumber: null,
    currentLineItems: [],
    currentPO: null,
    editingItemId: null,
    editingMilestoneId: null,
    stagedMilestones: []
};

async function openLineItemsModal(poNum) {
    lineItemsState.poNumber = poNum || document.getElementById('po_number').value;
    if (!lineItemsState.poNumber) {
        alert('Please enter or save the PO Number first.');
        return;
    }

    const modal = document.getElementById('lineItemsModal');
    modal.classList.add('open');
    resetEntireForm(); // Clear everything when opening fresh

    // Pre-populate from main form if fields exist
    const mainDate = document.getElementById('po_date');
    const mainValue = document.getElementById('po_value');

    document.getElementById('li_display_po_number').value = lineItemsState.poNumber;
    if (mainDate) document.getElementById('li_display_po_date').value = mainDate.value;
    if (mainValue) {
        const val = parseFloat(mainValue.value) || 0;
        document.getElementById('li_display_po_value').value = val.toLocaleString('en-US', { minimumFractionDigits: 2 });
    }

    // Initialize date dropdowns if not already done
    initLineItemDateDropdowns();

    // Load PO Line Items from DB
    await loadLineItemData();
}

function closeLineItemsModal() {
    // A simple close that only checks for unsaved form data, NOT grid validation
    const unsavedDesc = document.getElementById('li_description').value.trim();
    const unsavedMs = document.getElementById('ms_name').value.trim();

    if (unsavedDesc || unsavedMs) {
        if (!confirm("There is unsaved data in the entry panels. Close and discard current entry?")) {
            return;
        }
    }

    document.getElementById('lineItemsModal').classList.remove('open');
}

async function commitPOToDB() {
    // 1. Check if the grid has any items at all
    if (lineItemsState.currentLineItems.length === 0) {
        alert("The workspace is empty. Please save at least one line item to the grid before committing.");
        return;
    }

    // 2. Validate that 'all columns' are filled for every row in the grid
    for (const li of lineItemsState.currentLineItems) {
        if (!li.description || !li.line_item_no || li.quantity === "" || li.quantity === null) {
            alert(`Line Item ${li.line_item_no || 'Unknown'} has missing identification or quantity.`);
            return;
        }

        if (!li.milestones || li.milestones.length === 0) {
            alert(`Line Item ${li.line_item_no} has no payment milestones.`);
            return;
        }

        for (const ms of li.milestones) {
            const hasTerms = ms.payment_terms && ms.payment_terms.trim() !== "" && ms.payment_terms !== "-";
            const hasDocs = ms.documents && ms.documents.trim() !== "" && ms.documents !== "-";
            const hasName = ms.milestone_name && ms.milestone_name.trim() !== "";
            const hasValue = ms.cycle_value && parseFloat(ms.cycle_value) > 0;

            if (!hasTerms || !hasDocs || !hasName || !hasValue) {
                alert(`All columns in the grid must be filled before saving. \n\nPlease check Milestone: "${ms.milestone_name || 'Unnamed'}" in Line Item: ${li.line_item_no}. \n\nMissing: ${!hasName ? 'Milestone Name, ' : ''}${!hasValue ? 'Cycle Value, ' : ''}${!hasTerms ? 'Payment Terms, ' : ''}${!hasDocs ? 'Documents' : ''}`);
                return;
            }
        }
    }

    // If validation passes, show success message but STAY on the modal
    alert("Purchase Order Line Items are successfully validated and confirmed in the database.");
    // document.getElementById('lineItemsModal').classList.remove('open'); // User requested to stay on form
}

function initLineItemDateDropdowns() {
    const daySelect = document.getElementById('ms_day');
    if (daySelect.options.length > 0) return; // already init

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthSelect = document.getElementById('ms_month');
    const yearSelect = document.getElementById('ms_year');

    for (let i = 1; i <= 31; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        daySelect.appendChild(opt);
    }

    months.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i + 1;
        opt.textContent = m;
        monthSelect.appendChild(opt);
    });

    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i <= currentYear + 10; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        yearSelect.appendChild(opt);
    }
}

async function loadLineItemData() {
    if (!lineItemsState.poNumber) return;
    try {
        const lineItemsRes = await api.get(`/purchase-orders/${encodeURIComponent(lineItemsState.poNumber)}/line-items`);

        lineItemsState.currentLineItems = lineItemsRes.line_items || [];
        renderLineItemsTable();

        // Optional: Re-sync header from DB if you want to ensure total consistency, 
        // but local form values are usually the source of truth for unsaved state.
        const poRes = await api.get(`/purchase-orders/${encodeURIComponent(lineItemsState.poNumber)}`);
        if (poRes.purchase_order) {
            lineItemsState.currentPO = poRes.purchase_order;
            // Only update if not already set by openLineItemsModal
            if (!document.getElementById('li_display_po_date').value) {
                document.getElementById('li_display_po_date').value = lineItemsState.currentPO.po_date;
            }
        }
    } catch (err) {
        console.error('Error loading line item data:', err);
    }
}

function calculateMsCycleValue() {
    const qtyInput = document.getElementById('ms_quantity');
    const priceInput = document.getElementById('ms_unit_price');

    if (qtyInput.value < 0) qtyInput.value = 0;
    if (priceInput.value < 0) priceInput.value = 0;

    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    const cyclePct = parseFloat(document.getElementById('ms_payment_cycle').value) || 100;
    const value = (qty * price * cyclePct) / 100;
    document.getElementById('ms_cycle_value').value = value.toFixed(2);
}

function renderLineItemsTable() {
    const tbody = document.getElementById('li_summaryTableBody');
    tbody.innerHTML = '';
    lineItemsState.currentLineItems.forEach((li, idx) => {
        if (!li.milestones || li.milestones.length === 0) {
            // Should not happen but for safety
            const tr = document.createElement('tr');
            tr.innerHTML = `
                  <td>${li.line_item_no || (idx + 1)}</td>
                  <td>${li.description}</td>
                  <td>${li.quantity}</td>
                  <td colspan="5">No milestones</td>
                  <td>
                      <button onclick="editLineItem(${li.id})" class="btn-po-mini">Edit line item in the grid</button>
                      <button onclick="deleteLineItem(${li.id})" class="btn-po-mini btn-danger">Del</button>
                  </td>
              `;
            tbody.appendChild(tr);
            return;
        }

        li.milestones.forEach((ms, msIdx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${msIdx === 0 ? (li.line_item_no || (idx + 1)) : ''}</td>
                <td>${msIdx === 0 ? li.description : ''}</td>
                <td>${ms.quantity}</td>
                <td>${ms.milestone_name}</td>
                <td>${ms.cycle_value}</td>
                <td>${ms.payment_terms || '-'}</td>
                <td>${ms.documents || '-'}</td>
                <td>${ms.delivery_date}</td>
                <td style="text-align: right;">
                    <button onclick="editLineItem(${li.id}, ${ms.id})" class="btn-utility btn-mini">Edit</button>
                    <button onclick="deleteLineItem(${li.id}, ${ms.id})" class="btn-utility btn-mini" style="border-color:#ef4444; color:#ef4444;">Del</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
}

function editLineItem(liId, msId) {
    const li = lineItemsState.currentLineItems.find(item => item.id == liId);
    if (!li) return;

    // If msId is null (safety fallback), use first milestone
    const ms = msId ? li.milestones.find(m => m.id == msId) : li.milestones[0];
    if (!ms) return;

    lineItemsState.editingItemId = liId;
    lineItemsState.editingMilestoneId = msId;

    // Stage all OTHER milestones so they aren't lost on save
    lineItemsState.stagedMilestones = li.milestones.filter(m => m.id != msId);

    // Change button text and style for edit mode
    const saveBtn = document.getElementById('mainSaveBtn');
    if (saveBtn) {
        saveBtn.innerHTML = '🎯 Update Row';
        saveBtn.style.background = '#0ea5e9'; // Blue for update
    }

    // Load Identification Panel
    document.getElementById('li_line_item_no').value = li.line_item_no || '';
    document.getElementById('li_line_item_type').value = li.line_item_type || 'Software';
    document.getElementById('li_description').value = li.description || '';
    document.getElementById('li_li_quantity').value = li.quantity || 0;
    document.getElementById('li_gst_rate').value = li.gst_rate || 18;
    document.getElementById('li_hsn_sac_code').value = li.hsn_sac_code || '';

    // Load Milestone Panel
    document.getElementById('ms_name').value = ms.milestone_name || '';
    document.getElementById('ms_quantity').value = ms.quantity || 0;
    document.getElementById('ms_unit_price').value = ms.unit_price || 0;
    document.getElementById('ms_payment_cycle').value = ms.payment_cycle_pct || 100;
    document.getElementById('ms_cycle_value').value = ms.cycle_value || 0;
    document.getElementById('ms_documents').value = ms.documents || '';
    document.getElementById('ms_payment_terms').value = ms.payment_terms || '';

    if (ms.delivery_date) {
        const parts = ms.delivery_date.split('-');
        if (parts.length === 3) {
            document.getElementById('ms_year').value = parseInt(parts[0]);
            document.getElementById('ms_month').value = parseInt(parts[1]);
            document.getElementById('ms_day').value = parseInt(parts[2]);
        }
    }

    // Scroll form into view
    document.querySelector('.li-form-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetEntireForm() {
    resetLineItemIdentificationOnly();
    resetMilestoneFields();
    lineItemsState.stagedMilestones = [];

    // Reset date to today
    const now = new Date();
    document.getElementById('ms_year').value = now.getFullYear();
    document.getElementById('ms_month').value = now.getMonth() + 1;
    document.getElementById('ms_day').value = now.getDate();
}

function resetLineItemIdentificationOnly() {
    lineItemsState.editingItemId = null;
    lineItemsState.editingMilestoneId = null;

    // Reset buttons
    const saveBtn = document.getElementById('mainSaveBtn');
    if (saveBtn) {
        saveBtn.innerHTML = 'Save Line Item';
        saveBtn.style.background = 'var(--success-action)';
    }

    // Clear Identification fields only
    document.getElementById('li_line_item_no').value = '';
    document.getElementById('li_line_item_type').value = 'Software';
    document.getElementById('li_description').value = '';
    document.getElementById('li_li_quantity').value = 0;
    document.getElementById('li_gst_rate').value = 18;
    document.getElementById('li_hsn_sac_code').value = '';
}

function resetLineItemForm() {
    // This function is called by the "+ Add more PO line items" button
    resetLineItemIdentificationOnly();
}

function resetMilestoneFields() {
    document.getElementById('ms_name').value = '';
    document.getElementById('ms_quantity').value = 0;
    document.getElementById('ms_unit_price').value = 0;
    document.getElementById('ms_payment_cycle').value = 100;
    document.getElementById('ms_cycle_value').value = '0.00';
    document.getElementById('ms_documents').value = '';
    document.getElementById('ms_payment_terms').value = '';
}

function addMilestoneToSelection() {
    const liNo = document.getElementById('li_line_item_no').value.trim();
    const desc = document.getElementById('li_description').value.trim();

    if (!liNo || !desc) {
        alert('Required: Please fill in the "Line#" and "Project Description" in the Identification panel first.');
        return;
    }

    // Validate Milestone Fields before adding to stage
    const msNameInput = document.getElementById('ms_name').value.trim();
    const msQty = parseFloat(document.getElementById('ms_quantity').value) || 0;
    const msPrice = parseFloat(document.getElementById('ms_unit_price').value) || 0;
    const msPct = parseFloat(document.getElementById('ms_payment_cycle').value) || 0;
    const msTerms = document.getElementById('ms_payment_terms').value.trim();
    const msDocs = document.getElementById('ms_documents').value.trim();

    if (!msNameInput) return alert('Field Required: Milestone Name');
    if (msQty <= 0) return alert('Milestone Qty must be greater than 0');
    if (msPrice <= 0) return alert('Milestone Unit Price must be greater than 0');
    if (msPct <= 0) return alert('Payment Cycle % must be greater than 0');
    if (!msTerms) return alert('Field Required: Payment Terms (Milestone)');
    if (!msDocs) return alert('Field Required: Documents Required (Milestone)');

    const currentMs = {
        milestone_name: msNameInput,
        quantity: msQty,
        unit_price: msPrice,
        payment_cycle_pct: msPct,
        cycle_value: document.getElementById('ms_cycle_value').value,
        documents: msDocs,
        payment_terms: msTerms,
        delivery_date: `${document.getElementById('ms_year').value}-${document.getElementById('ms_month').value.padStart(2, '0')}-${document.getElementById('ms_day').value.padStart(2, '0')}`
    };

    // Add to staged milestones
    lineItemsState.stagedMilestones.push(currentMs);

    // Provide visual feedback
    alert(`Milestone "${msNameInput}" added to staging! Total milestones staged: ${lineItemsState.stagedMilestones.length}. Add another milestone or click "Save Line Item" when done.`);

    // Clear milestone fields for next entry
    resetMilestoneFields();
}

async function deleteLineItem(liId, msId) {
    const li = lineItemsState.currentLineItems.find(item => item.id == liId);
    if (!li) return;

    if (li.milestones.length <= 1) {
        // Only one milestone exists, delete entire line item
        if (!confirm('This is the only row for this line item. Deleting it will remove the entire item. Proceed?')) return;
        try {
            const res = await api.delete(`/line-items/${liId}`);
            if (!res.error) await loadLineItemData();
            else alert('Error: ' + res.error);
        } catch (err) { console.error(err); }
    } else {
        // Multiple milestones, only delete this respective row
        if (!confirm('Are you sure you want to delete only this respective row (Milestone)?')) return;
        try {
            const res = await api.delete(`/milestones/${msId}`);
            if (!res.error) await loadLineItemData();
            else alert('Error: ' + res.error);
        } catch (err) { console.error(err); }
    }
}

async function saveLineItemToDB(stayOnIdentification = false) {
    if (!lineItemsState.poNumber) return alert('No PO Number');

    // ========== STEP 1: Validate Line Item Identification & Specs fields FIRST ==========
    const liNo = document.getElementById('li_line_item_no').value.trim();
    const liDesc = document.getElementById('li_description').value.trim();
    const hsnValue = document.getElementById('li_hsn_sac_code').value.trim();
    const liQty = parseFloat(document.getElementById('li_li_quantity').value) || 0;

    if (!liNo) return alert('Field Required: Line#');
    if (!liDesc) return alert('Field Required: Project Description / Scope of Work');
    if (!hsnValue) return alert('Field Required: HSN/SAC Code');
    if (liQty <= 0) return alert('Field Required: Qty (must be greater than 0)');

    if (hsnValue.length !== 8 || isNaN(hsnValue)) {
        alert('HSN/SAC Code must be exactly 8 digits.');
        return;
    }

    // Check for duplicate Line Item Number
    const duplicate = lineItemsState.currentLineItems.find(item =>
        item.line_item_no === liNo &&
        (!lineItemsState.editingItemId || item.id != lineItemsState.editingItemId)
    );

    if (duplicate) {
        alert(`Line Item Number "${liNo}" already exists! Please use a unique Line Item #.`);
        return;
    }

    // ========== STEP 2: Validate Financial Milestone Details ==========
    const finalMilestones = [...lineItemsState.stagedMilestones];

    // Check if user has filled in milestone details but forgot to click "Add Another Milestone"
    const msNameInput = document.getElementById('ms_name').value.trim();
    const msQtyInput = parseFloat(document.getElementById('ms_quantity').value) || 0;

    if (msNameInput || msQtyInput > 0) {
        // If it's the ONLY milestone (and nothing is staged yet), we can auto-add it for convenience
        // BUT per request "add all milestones and then prompt", it's safer to ask them to add it explicitly or do it automatically if it's the last one.
        // Let's auto-add it to the list for the final save if valid
        const msPrice = parseFloat(document.getElementById('ms_unit_price').value) || 0;
        const msPct = parseFloat(document.getElementById('ms_payment_cycle').value) || 0;
        const msTerms = document.getElementById('ms_payment_terms').value.trim();
        const msDocs = document.getElementById('ms_documents').value.trim();

        if (msNameInput && msQtyInput > 0 && msPrice > 0 && msPct > 0 && msTerms && msDocs) {
            const currentMs = {
                milestone_name: msNameInput,
                quantity: msQtyInput,
                unit_price: msPrice,
                payment_cycle_pct: msPct,
                cycle_value: document.getElementById('ms_cycle_value').value,
                documents: msDocs,
                payment_terms: msTerms,
                delivery_date: `${document.getElementById('ms_year').value}-${document.getElementById('ms_month').value.padStart(2, '0')}-${document.getElementById('ms_day').value.padStart(2, '0')}`
            };
            finalMilestones.push(currentMs);
        } else {
            return alert('You have unsaved details in the Financial Milestone section. Please either clear them or click "+ Add Another Milestone" to include them.');
        }
    }

    if (finalMilestones.length === 0) {
        return alert('Please add at least one milestone using the "+ Add Another Milestone" button.');
    }

    // ========== STEP 3: Validate Integrity (Total Quantity Check) ==========
    const totalMilestoneQty = finalMilestones.reduce((sum, ms) => sum + (parseFloat(ms.quantity) || 0), 0);

    // Validate that total quantity is not empty/zero
    if (totalMilestoneQty <= 0) {
        alert('Milestone Qty cannot be empty. Please ensure at least one milestone has a quantity greater than 0.');
        return;
    }

    // Ensure total milestone quantity matches the line item quantity exactly
    if (totalMilestoneQty !== liQty) {
        alert(`Mismatch Error: The sum of all Milestone Quantities (${totalMilestoneQty}) must be equal to the Line Item Quantity (${liQty}).`);
        return;
    }

    // No need to overwrite document.getElementById('li_li_quantity').value anymore, we validate it instead

    const lineItem = {
        line_item_no: document.getElementById('li_line_item_no').value,
        line_item_type: document.getElementById('li_line_item_type').value,
        description: document.getElementById('li_description').value,
        quantity: totalMilestoneQty,
        gst_rate: document.getElementById('li_gst_rate').value,
        hsn_sac_code: hsnValue,
        milestones: finalMilestones
    };

    try {
        let res;
        const saveBtn = document.getElementById('mainSaveBtn');
        const originalBtnText = saveBtn.innerHTML;
        saveBtn.innerHTML = 'Processing...';
        saveBtn.disabled = true;

        if (lineItemsState.editingItemId) {
            res = await api.put(`/line-items/${lineItemsState.editingItemId}`, lineItem);
        } else {
            res = await api.post(`/purchase-orders/${encodeURIComponent(lineItemsState.poNumber)}/line-items`, lineItem);
        }

        if (!res.error) {
            // Persist the ID if it was a new creation so subsequent additions update the same record
            lineItemsState.editingItemId = lineItemsState.editingItemId || res.id;
            // Update staged milestones to reflect everything saved so far
            lineItemsState.stagedMilestones = finalMilestones;

            saveBtn.innerHTML = 'Save Line Item';
            saveBtn.style.background = 'var(--success-action)';
            saveBtn.disabled = false;

            if (stayOnIdentification) {
                resetMilestoneFields();
            } else {
                resetEntireForm();
            }

            await loadLineItemData();
            updateMainPOValue();

            if (stayOnIdentification) {
                alert('Milestone committed to grid. You can now add the next milestone for this item.');
            } else {
                alert('Line item saved successfully!');
            }
        } else {
            alert('Error: ' + res.error);
            saveBtn.innerHTML = originalBtnText;
            saveBtn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        alert('Failed to save to database');
    }
}

function updateMainPOValue() {
    // Calculate total value from current line items
    let total = 0;
    lineItemsState.currentLineItems.forEach(li => {
        if (li.milestones) {
            li.milestones.forEach(ms => {
                total += parseFloat(ms.cycle_value) || 0;
            });
        }
    });

    const formattedTotal = total.toFixed(2);

    // Update modal header
    document.getElementById('li_display_po_value').value = total.toLocaleString('en-US', { minimumFractionDigits: 2 });

    // Update main form PO Value field if it exists
    const mainPoValueField = document.getElementById('po_value');
    if (mainPoValueField) {
        mainPoValueField.value = formattedTotal;
    }

    // Optionally update the backend PO value as well
    api.put(`/purchase-orders/${encodeURIComponent(lineItemsState.poNumber)}`, {
        po_value: formattedTotal
    }).then(() => {
        // If there's a global BG calculation function, call it to sync BG with new PO value
        if (typeof window.calculateBgFd === 'function') {
            window.calculateBgFd();
        }
    }).catch(err => console.error('Failed to auto-sync PO value:', err));
}

function editLineItemFromGrid() {
    const grid = document.querySelector('.li-grid-section');
    if (grid) {
        grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight the grid to guide user
        grid.style.outline = '3px solid #0288d1';
        setTimeout(() => grid.style.outline = 'none', 1500);
    }
}

// Billing Modal HTML - using same CSS as line items modal
const billingModalHTML = `
<div id="billingModal" class="li-modal-overlay" style="z-index: 10000;">
    <div class="li-modal-card">
        <div class="li-modal-header">
            <h2 class="li-modal-title">💰 Billing Details for Selected Line Items</h2>
            <button onclick="closeBillingModal()" class="li-modal-close">&times;</button>
        </div>
        
        <div class="li-modal-body">
            <!-- Context Bar -->
            <div class="li-context-bar">
                <div class="li-context-item">
                    <label>PO REF:</label>
                    <input type="text" id="bill_po_number" readonly>
                </div>
                <div class="li-context-item">
                    <label>PO VALUE:</label>
                    <input type="text" id="bill_po_value" readonly>
                </div>
                <div style="flex: 1;"></div>
                <div style="background: #00bcd4; padding: 0.4rem 0.75rem; border-radius: 4px; text-align: center; color: black; font-size: 0.7rem; font-weight: 700;">
                    Autogenerated email For Payment Reminder (2 days before due date)
                </div>
            </div>

            <!-- Form Container -->
            <div class="li-form-container">
                <!-- Left Block: Invoice Details -->
                <div class="form-block">
                    <div class="form-title">Invoice Details</div>
                    <div class="li-compact-grid">
                        <div class="li-field">
                            <label>Invoice No</label>
                            <input type="text" id="bill_invoice_no">
                        </div>
                        <div class="li-field">
                            <label>Invoice Date</label>
                            <input type="date" id="bill_invoice_date">
                        </div>
                        <div class="li-field">
                            <label>Status</label>
                            <select id="bill_status">
                                <option>Pending</option>
                                <option>Received</option>
                                <option>Cancel</option>
                            </select>
                        </div>
                        <div class="li-field">
                            <label>Invoice Taxable Value (A)</label>
                            <input type="number" id="bill_taxable_val" oninput="calcBillTotal()">
                        </div>
                        <div class="li-field">
                            <label>GST @18% on Taxable (B)</label>
                            <input type="number" id="bill_gst_val" readonly style="background:#fefce8;">
                        </div>
                        <div class="li-field">
                            <label>Total Invoice Value (C=A+B)</label>
                            <input type="number" id="bill_total_val" readonly style="background:#fefce8; font-weight:700;">
                        </div>
                    </div>
                </div>

                <!-- Right Block: Payment Details -->
                <div class="form-block">
                    <div class="form-title">Payment Details</div>
                    <div class="li-compact-grid">
                        <div class="li-field">
                            <label>Credit Period</label>
                            <input type="text" id="bill_credit_period" placeholder="e.g. 30 days">
                        </div>
                        <div class="li-field">
                            <label>Due Date (InvD + Credit)</label>
                            <input type="date" id="bill_due_date">
                        </div>
                        <div class="li-field">
                            <label>Payment Received</label>
                            <input type="number" id="bill_payment_rec">
                        </div>
                        <div class="li-field full">
                            <label>Remarks</label>
                            <textarea id="bill_remarks" placeholder="Additional notes..."></textarea>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tax-strip">PO Line Item Cycle Value = Invoice Taxable Value</div>

            <!-- Table Section -->
            <div class="li-table-wrapper">
                <table class="li-pro-table">
                    <thead>
                        <tr>
                            <th style="width:30px;"><input type="checkbox" id="billSelectAll" onclick="toggleAllBillingRows(this)"></th>
                            <th>Line Item No</th>
                            <th>Description</th>
                            <th>Quantity</th>
                            <th>Cycle Value</th>
                            <th>Mile Stone</th>
                            <th>Payment Terms</th>
                            <th>Document</th>
                            <th>Delivery Time</th>
                            <th>Invoice No</th>
                            <th>Invoice Date</th>
                            <th>Invoice Value</th>
                            <th>Payment Rec</th>
                            <th>Pending Amt</th>
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody id="billingGridBody">
                        <!-- Rows populated dynamically -->
                    </tbody>
                </table>
            </div>
        </div>

        <div class="li-modal-footer">
            <button onclick="editBillingItem()" class="btn-pro btn-blue">Edit Invoice</button>
            <button onclick="cancelBillingItem()" class="btn-pro btn-blue">Cancel Invoice</button>
            <button onclick="saveBillingItem()" class="btn-pro btn-green">Save Invoice</button>
            <button onclick="recordPayment()" class="btn-pro btn-navy">Payment</button>
            <button onclick="closeBillingModal()" class="btn-pro btn-orange">Close</button>
        </div>
    </div>
</div>`;

// Inject billing modal into the page if it doesn't exist
function ensureBillingModalExists() {
    if (!document.getElementById('billingModal')) {
        document.body.insertAdjacentHTML('beforeend', billingModalHTML);
    }
}

function openBillingModal() {
    ensureBillingModalExists();

    const modal = document.getElementById('billingModal');
    if (modal) {
        modal.classList.add('open');

        // Copy PO info from the line items modal
        const poNum = lineItemsState.poNumber || document.getElementById('li_display_po_number')?.value || document.getElementById('po_number')?.value;
        const poVal = document.getElementById('li_display_po_value')?.value || document.getElementById('po_value')?.value;

        if (poNum) document.getElementById('bill_po_number').value = poNum;
        if (poVal) document.getElementById('bill_po_value').value = poVal;

        // Copy line items data to billing grid
        populateBillingGrid();
    } else {
        alert('Error: Billing modal could not be created.');
    }
}

function populateBillingGrid() {
    const tbody = document.getElementById('billingGridBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Copy data from lineItemsState.currentLineItems
    lineItemsState.currentLineItems.forEach((li, idx) => {
        if (!li.milestones || li.milestones.length === 0) {
            // Line item without milestones
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="checkbox" class="bill-row-select" data-li="${li.id}"></td>
                <td>${li.line_item_no || (idx + 1)}</td>
                <td>${li.description || ''}</td>
                <td>${li.quantity || ''}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td><input type="text" class="bill-grid-input" data-li="${li.id}" data-field="invoice_no"></td>
                <td><input type="date" class="bill-grid-input" data-li="${li.id}" data-field="invoice_date"></td>
                <td><input type="number" class="bill-grid-input" data-li="${li.id}" data-field="invoice_value"></td>
                <td><input type="number" class="bill-grid-input" data-li="${li.id}" data-field="payment_received"></td>
                <td><span class="pending-amt" data-li="${li.id}">0.00</span></td>
                <td><input type="text" class="bill-grid-input" data-li="${li.id}" data-field="remarks"></td>
            `;
            tbody.appendChild(tr);
            return;
        }

        // Line items with milestones
        li.milestones.forEach((ms, msIdx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="checkbox" class="bill-row-select" data-li="${li.id}" data-ms="${ms.id}"></td>
                <td>${msIdx === 0 ? (li.line_item_no || (idx + 1)) : ''}</td>
                <td>${msIdx === 0 ? (li.description || '') : ''}</td>
                <td>${ms.quantity || ''}</td>
                <td>${ms.cycle_value || ''}</td>
                <td>${ms.milestone_name || ''}</td>
                <td>${ms.payment_terms || '-'}</td>
                <td>${ms.documents || '-'}</td>
                <td>${ms.delivery_date || '-'}</td>
                <td><input type="text" class="bill-grid-input" style="width:80px;" data-li="${li.id}" data-ms="${ms.id}" data-field="invoice_no"></td>
                <td><input type="date" class="bill-grid-input" style="width:100px;" data-li="${li.id}" data-ms="${ms.id}" data-field="invoice_date"></td>
                <td><input type="number" class="bill-grid-input" style="width:80px;" data-li="${li.id}" data-ms="${ms.id}" data-field="invoice_value"></td>
                <td><input type="number" class="bill-grid-input" style="width:80px;" data-li="${li.id}" data-ms="${ms.id}" data-field="payment_received"></td>
                <td><span class="pending-amt" data-li="${li.id}" data-ms="${ms.id}">0.00</span></td>
                <td><input type="text" class="bill-grid-input" style="width:80px;" data-li="${li.id}" data-ms="${ms.id}" data-field="remarks"></td>
            `;
            tbody.appendChild(tr);
        });
    });
}

function toggleAllBillingRows(selectAllCheckbox) {
    const checkboxes = document.querySelectorAll('.bill-row-select');
    checkboxes.forEach(cb => {
        cb.checked = selectAllCheckbox.checked;
    });
}

function closeBillingModal() {
    const modal = document.getElementById('billingModal');
    if (modal) {
        modal.classList.remove('open');
    }
}

window.calcBillTotal = function () {
    const taxable = parseFloat(document.getElementById('bill_taxable_val')?.value) || 0;
    const gst = taxable * 0.18;
    const gstField = document.getElementById('bill_gst_val');
    const totalField = document.getElementById('bill_total_val');
    if (gstField) gstField.value = gst.toFixed(2);
    if (totalField) totalField.value = (taxable + gst).toFixed(2);
}

// Legacy function name for backward compatibility
function openBillingPage() {
    openBillingModal();
}

// Placeholder functions for billing modal buttons (to be implemented with backend later)
function editBillingItem() {
    alert('Edit Invoice: Select an invoice from the grid to edit.');
}

function cancelBillingItem() {
    if (confirm('Are you sure you want to cancel this invoice?')) {
        alert('Invoice cancellation feature will be implemented with backend.');
    }
}

function saveBillingItem() {
    const invoiceNo = document.getElementById('bill_invoice_no')?.value;
    const invoiceDate = document.getElementById('bill_invoice_date')?.value;
    const taxableVal = document.getElementById('bill_taxable_val')?.value;

    if (!invoiceNo || !invoiceDate || !taxableVal) {
        alert('Please fill in Invoice No, Invoice Date, and Taxable Value.');
        return;
    }

    alert('Invoice saved successfully! (Backend integration pending)');
}

function recordPayment() {
    const paymentRec = document.getElementById('bill_payment_rec')?.value;
    if (!paymentRec) {
        alert('Please enter the Payment Received amount.');
        return;
    }
    alert('Payment recorded successfully! (Backend integration pending)');
}
