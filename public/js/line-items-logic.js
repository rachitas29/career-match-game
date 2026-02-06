/**
 * Shared logic for PO Line Items Management Modal
 */

let lineItemsState = {
    poNumber: null,
    currentLineItems: [],
    currentPO: null,
    editingItemId: null,
    editingMilestoneId: null,
    stagedMilestones: [],
    deletedLineItemIds: [], // Track IDs to delete from DB on final save
    hasUnsavedChanges: false, // Tracks if anything in the grid has changed since last save
    saveButtonUnlocked: false // Locked by default, unlocked by Close attempt
};

// Expose line items for saving via main form
window.getLineItemsForSave = function () {
    return lineItemsState.currentLineItems;
};

// Clear line items after successful save
window.clearLineItemsAfterSave = function () {
    lineItemsState.currentLineItems = [];
    lineItemsState.stagedMilestones = [];
    lineItemsState.deletedLineItemIds = [];
    lineItemsState.hasUnsavedChanges = false;
    lineItemsState.saveButtonUnlocked = false;
};

// Expose deleted line items for final DB sync
window.getDeletedLineItemsForSave = function () {
    return lineItemsState.deletedLineItemIds || [];
};

// Global validation helper to ensure at least one milestone exists
window.validateHasMilestones = function () {
    if (lineItemsState.currentLineItems.length === 0) return false;

    // Check if any line item has at least one milestone
    const anyMilestones = lineItemsState.currentLineItems.some(item => item.milestones && item.milestones.length > 0);
    return anyMilestones;
};

async function openLineItemsModal(poNum, forceLoadFromDB = false) {
    // Robustness: Always trim the input PO number
    const trimmedInput = (poNum || "").toString().trim();
    const mainPoNum = (document.getElementById('po_number')?.value || "").toString().trim();

    const targetPoNum = trimmedInput || mainPoNum;
    const isNewPoNum = lineItemsState.poNumber !== targetPoNum;

    lineItemsState.poNumber = targetPoNum;

    if (!lineItemsState.poNumber) {
        alert('Please enter or save the PO Number first.');
        return;
    }

    const modal = document.getElementById('lineItemsModal');
    if (modal) modal.classList.add('open');

    // If it's a completely different PO number, reset memory
    if (isNewPoNum) {
        lineItemsState.currentLineItems = [];
        lineItemsState.stagedMilestones = [];
        lineItemsState.deletedLineItemIds = [];
        lineItemsState.hasUnsavedChanges = false;
        lineItemsState.saveButtonUnlocked = false;
    }

    resetEntireForm(); // Clear the input panels

    // Pre-populate from main form if fields exist
    const mainDate = document.getElementById('po_date');
    const mainValue = document.getElementById('po_value');

    const displayPoField = document.getElementById('li_display_po_number');
    if (displayPoField) displayPoField.value = lineItemsState.poNumber;

    if (mainDate) document.getElementById('li_display_po_date').value = mainDate.value;
    if (mainValue) {
        const val = parseFloat(mainValue.value) || 0;
        document.getElementById('li_display_po_value').value = val.toLocaleString('en-US', { minimumFractionDigits: 2 });
    }

    // Initialize date dropdowns if not already done
    initLineItemDateDropdowns();

    // Robust Edit Page Detection
    const isEditPage = window.location.pathname.includes('edit-purchase-order.html') ||
        new URLSearchParams(window.location.search).has('po_number');

    if (forceLoadFromDB || (isEditPage && lineItemsState.currentLineItems.length === 0)) {
        console.log(`[LineItems] Triggering DB Fetch for PO: ${lineItemsState.poNumber}`);
        await loadLineItemData();
    } else {
        renderLineItemsTable();
        updateMainPOValueFromMemory();
    }
}

function closeLineItemsModal() {
    // A simple close that only checks for unsaved form data, NOT grid validation
    const unsavedDesc = document.getElementById('li_description').value.trim();
    const unsavedMs = document.getElementById('ms_name').value.trim();

    // Check for unsaved changes in grid
    console.log('[DEBUG] closeLineItemsModal check. hasUnsavedChanges:', lineItemsState.hasUnsavedChanges);
    if (lineItemsState.hasUnsavedChanges) {
        // Unlock the save button so user can click it now
        lineItemsState.saveButtonUnlocked = true;
        renderLineItemsTable(); // Refresh UI to enable the button

        if (!confirm("You have unsaved changes in the grid.\n\nThe 'Save Items to DB' button is now ENABLED.\n\nPlease save your data to the database either from the line item form (Save Items to DB) or by updating the PO.\n\nClose anyway?")) {
            return;
        }
    }

    if (unsavedDesc || unsavedMs) {
        if (!confirm("There is unsaved data in the entry panels. Close and discard current entry?")) {
            return;
        }
    }

    document.getElementById('lineItemsModal').classList.remove('open');
}

async function commitPOToDB() {
    // 1. Check if the grid has any items at all OR if there are pending deletions
    const hasPendingDeletions = lineItemsState.deletedLineItemIds && lineItemsState.deletedLineItemIds.length > 0;

    if (lineItemsState.currentLineItems.length === 0 && !hasPendingDeletions) {
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
            const hasName = ms.milestone_name && ms.milestone_name.trim() !== "";
            // const hasValue = ms.cycle_value && parseFloat(ms.cycle_value) > 0; // Relaxed?
            // Keeping value check as it seems critical, but removing terms/docs as requested previously

            if (!hasName) {
                alert(`Missing Milestone Name in Line Item: ${li.line_item_no}.`);
                return;
            }
        }
    }

    const btn = document.getElementById('btnSaveItemsToDB');
    if (btn) {
        btn.innerHTML = 'Saving...';
        btn.disabled = true;
    }

    try {
        let successCount = 0;
        let failCount = 0;

        // 3. Process each line item
        for (const li of lineItemsState.currentLineItems) {
            const isNew = !li.id || li.id.toString().startsWith('temp_');

            const payload = {
                line_item_no: li.line_item_no,
                line_item_type: li.line_item_type,
                description: li.description,
                quantity: li.quantity,
                gst_rate: li.gst_rate,
                hsn_sac_code: li.hsn_sac_code,
                milestones: li.milestones.map(m => ({
                    id: (m.id && !m.id.toString().startsWith('temp_')) ? m.id : null,
                    milestone_name: m.milestone_name,
                    quantity: m.quantity,
                    unit_price: m.unit_price,
                    payment_cycle_pct: m.payment_cycle_pct,
                    cycle_value: m.cycle_value,
                    documents: m.documents,
                    payment_terms: m.payment_terms,
                    delivery_date: m.delivery_date,
                    // Preserve billing fields if they exist
                    invoice_no: m.invoice_no,
                    invoice_date: m.invoice_date,
                    invoice_value: m.invoice_value,
                    payment_received: m.payment_received,
                    pending_amount: m.pending_amount,
                    remarks: m.remarks,
                    status: m.status,
                    credit_period: m.credit_period
                }))
            };

            let res;
            if (isNew) {
                res = await api.post(`/purchase-orders/${encodeURIComponent(lineItemsState.poNumber)}/line-items`, payload);
            } else {
                res = await api.put(`/line-items/${li.id}`, payload);
            }

            if (res && (res.id || res.message)) {
                successCount++;
                // Update local ID if it was new
                if (isNew && res.id) {
                    li.id = res.id;
                    // We might need to reload milestones to get their new IDs, 
                    // but for now let's just mark it as not-temp.
                }
            } else {
                failCount++;
                console.error("Failed to save LI:", li, res);
            }
        }

        // Handle deletions
        if (lineItemsState.deletedLineItemIds.length > 0) {
            for (const id of lineItemsState.deletedLineItemIds) {
                await api.delete(`/line-items/${id}`);
            }
            lineItemsState.deletedLineItemIds = []; // Clear
        }

        alert(`Sync Complete!\nSaved/Updated: ${successCount}\nFailed: ${failCount}`);

        // Reset dirty flag
        lineItemsState.hasUnsavedChanges = false;

        // Reload to ensure all IDs are synced
        window.location.reload();

    } catch (error) {
        console.error("Error committing PO:", error);
        alert("Error saving to database: " + error.message);
    } finally {
        if (btn) {
            btn.innerHTML = 'SAVE ITEMS TO DB';
            btn.disabled = false;
        }
    }
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
        console.log(`[LineItems] Fetching items for ${lineItemsState.poNumber}...`);
        const lineItemsRes = await api.get(`/purchase-orders/${encodeURIComponent(lineItemsState.poNumber.trim())}/line-items`);

        if (lineItemsRes.error) {
            console.error('[LineItems] API Error:', lineItemsRes.error);
            alert('Failed to load line items: ' + lineItemsRes.error);
            return;
        }

        lineItemsState.currentLineItems = lineItemsRes.line_items || [];
        // Reset dirty flag after fresh load
        lineItemsState.hasUnsavedChanges = false;
        lineItemsState.saveButtonUnlocked = false;

        console.log(`[LineItems] Success: Received ${lineItemsState.currentLineItems.length} items`);
        renderLineItemsTable();

        // Optional: Re-sync header from DB if you want to ensure total consistency
        const poRes = await api.get(`/purchase-orders/${encodeURIComponent(lineItemsState.poNumber.trim())}`);
        if (poRes.purchase_order) {
            lineItemsState.currentPO = poRes.purchase_order;
            // Update display fields if they are empty
            const dateField = document.getElementById('li_display_po_date');
            if (dateField && !dateField.value) {
                dateField.value = lineItemsState.currentPO.po_date;
            }
        }
    } catch (err) {
        console.error('[LineItems] Critical Fetch Failure:', err);
        alert('A critical error occurred while loading line item data.');
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

    // Toggle Save Button
    const saveDbBtn = document.getElementById('btnSaveItemsToDB');
    if (saveDbBtn) {
        // Enable if Dirty
        saveDbBtn.disabled = !lineItemsState.hasUnsavedChanges;
    }

    lineItemsState.currentLineItems.forEach((li, idx) => {
        if (!li.milestones || li.milestones.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                  <td>${li.line_item_no || (idx + 1)}</td>
                  <td>${li.description}</td>
                  <td>${li.quantity}</td>
                  <td colspan="11">No milestones defined for this item</td>
                  <td>
                      <button onclick="editLineItem('${li.id}')" class="btn-utility btn-mini">Edit</button>
                      <button onclick="deleteLineItem('${li.id}')" class="btn-utility btn-mini" style="border-color:#ef4444; color:#ef4444;">Del</button>
                  </td>
              `;
            tbody.appendChild(tr);
            return;
        }

        li.milestones.forEach((ms, msIdx) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-row-id', `${li.id}_${ms.id}`);

            // Highlight if editing
            if (lineItemsState.editingItemId == li.id && lineItemsState.editingMilestoneId == ms.id) {
                tr.classList.add('editing-highlight');
            }

            tr.innerHTML = `
                <td>${msIdx === 0 ? (li.line_item_no || (idx + 1)) : ''}</td>
                <td style="text-align: left;">${msIdx === 0 ? li.description : ''}</td>
                <td>${msIdx === 0 ? li.quantity : ''}</td>
                <td>${ms.cycle_value}</td>
                <td>${ms.milestone_name}</td>
                <td>${ms.payment_terms || '-'}</td>
                <td>${ms.documents || '-'}</td>
                <td>${ms.delivery_date}</td>
                <td>${ms.invoice_no || '-'}</td>
                <td>${ms.invoice_date || '-'}</td>
                <td>${ms.invoice_value ? parseFloat(ms.invoice_value).toFixed(2) : '-'}</td>
                <td>${ms.payment_received ? parseFloat(ms.payment_received).toFixed(2) : '-'}</td>
                <td>${ms.pending_amount ? parseFloat(ms.pending_amount).toFixed(2) : '-'}</td>
                <td>${ms.remarks || '-'}</td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 4px; justify-content: flex-end;">
                        <button onclick="editLineItem('${li.id}', '${ms.id}')" class="btn-utility btn-mini">Edit</button>
                        <button onclick="deleteLineItem('${li.id}', '${ms.id}')" class="btn-utility btn-mini" style="border-color:#ef4444; color:#ef4444;">Del</button>
                    </div>
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

    // Apply Highlighting
    const allRows = document.querySelectorAll('#li_summaryTableBody tr');
    allRows.forEach(r => r.classList.remove('editing-highlight'));

    const activeRow = document.querySelector(`tr[data-row-id="${liId}_${msId}"]`);
    if (activeRow) {
        activeRow.classList.add('editing-highlight');
        activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

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

    const priceEl = document.getElementById('ms_unit_price');
    priceEl.value = ms.unit_price || 0;

    // Check if it's the first milestone of this line item
    const isFirstMs = li.milestones[0].id == msId;
    if (!isFirstMs) {
        priceEl.readOnly = true;
        priceEl.style.backgroundColor = '#f1f5f9';
    } else {
        priceEl.readOnly = false;
        priceEl.style.backgroundColor = 'white';
    }

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
    resetMilestoneFields(true); // Complete clear
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

    // Remove Highlighting
    const allRows = document.querySelectorAll('#li_summaryTableBody tr');
    allRows.forEach(r => r.classList.remove('editing-highlight'));

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

function resetMilestoneFields(completeClear = false) {
    document.getElementById('ms_name').value = '';
    document.getElementById('ms_quantity').value = 0;

    const priceEl = document.getElementById('ms_unit_price');
    if (completeClear) {
        priceEl.value = 0;
        priceEl.readOnly = false;
        priceEl.style.backgroundColor = 'white';
    } else {
        // If we have staged milestones, keep the price from the first one
        if (lineItemsState.stagedMilestones.length > 0) {
            priceEl.value = lineItemsState.stagedMilestones[0].unit_price;
            priceEl.readOnly = true;
            priceEl.style.backgroundColor = '#f1f5f9';
        } else {
            priceEl.value = 0;
            priceEl.readOnly = false;
            priceEl.style.backgroundColor = 'white';
        }
    }

    document.getElementById('ms_payment_cycle').value = 100;
    document.getElementById('ms_cycle_value').value = '0.00';
    document.getElementById('ms_documents').value = '';
    document.getElementById('ms_payment_terms').value = '';
}

function addMilestoneToSelection() {
    const liNo = document.getElementById('li_line_item_no').value.trim();
    const desc = document.getElementById('li_description').value.trim();
    const liQty = parseFloat(document.getElementById('li_li_quantity').value) || 0;

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
    // REMOVED: Mandatory checks for Terms and Docs as per user request
    // if (!msTerms) return alert('Field Required: Payment Terms (Milestone)');
    // if (!msDocs) return alert('Field Required: Documents Required (Milestone)');

    // Check if adding this milestone would exceed line item qty
    const currentTotalQty = lineItemsState.stagedMilestones.reduce((sum, ms) => sum + (parseFloat(ms.quantity) || 0), 0);
    const newTotalQty = currentTotalQty + msQty;

    if (newTotalQty > liQty) {
        const remaining = liQty - currentTotalQty;
        alert(`Cannot add milestone: Total milestone qty (${newTotalQty}) would exceed Line Item Qty (${liQty}). Remaining qty available: ${remaining}`);
        return;
    }

    if (currentTotalQty >= liQty) {
        alert(`Line Item Qty (${liQty}) is already fully allocated to milestones. Cannot add more milestones.`);
        return;
    }

    const priceEl = document.getElementById('ms_unit_price');
    let finalPrice = msPrice;

    // If we have staged, enforce the first one's price
    if (lineItemsState.stagedMilestones.length > 0) {
        finalPrice = lineItemsState.stagedMilestones[0].unit_price;
        priceEl.value = finalPrice;
    }

    const currentMs = {
        id: 'temp_ms_' + Date.now(),
        milestone_name: msNameInput,
        quantity: msQty,
        unit_price: finalPrice,
        payment_cycle_pct: msPct,
        cycle_value: (msQty * finalPrice * msPct / 100).toFixed(2),
        documents: msDocs,
        payment_terms: msTerms,
        delivery_date: `${document.getElementById('ms_year').value}-${document.getElementById('ms_month').value.padStart(2, '0')}-${document.getElementById('ms_day').value.padStart(2, '0')}`
    };

    // Add to staged milestones
    lineItemsState.stagedMilestones.push(currentMs);

    // Provide visual feedback with remaining qty info
    const remainingAfterAdd = liQty - newTotalQty;
    if (remainingAfterAdd > 0) {
        alert(`Milestone "${msNameInput}" added! Total milestone qty: ${newTotalQty}/${liQty}. Remaining qty: ${remainingAfterAdd}. Add another milestone or click "Save Line Item".`);
    } else {
        alert(`Milestone "${msNameInput}" added! All quantity allocated (${newTotalQty}/${liQty}). Click "Save Line Item" to add to grid.`);
    }

    // Clear milestone fields for next entry
    resetMilestoneFields();
}

// Delete line item from memory (not database)
function deleteLineItem(liId, msId) {
    const liIndex = lineItemsState.currentLineItems.findIndex(item => item.id == liId);
    if (liIndex === -1) return;

    const li = lineItemsState.currentLineItems[liIndex];

    if (!msId || li.milestones.length <= 1) {
        // Validation: Cannot delete the last line item
        if (lineItemsState.currentLineItems.length <= 1) {
            alert('A Purchase Order must have at least one line item. You cannot delete the last item.');
            return;
        }

        // Delete entire line item
        if (!confirm('This will remove the entire line item. Proceed?')) return;

        // If it's a real DB ID (not temp_), track it for deletion
        if (li.id && !li.id.toString().startsWith('temp_')) {
            lineItemsState.deletedLineItemIds.push(li.id);
        }

        lineItemsState.currentLineItems.splice(liIndex, 1);
    } else {
        // Delete only the specific milestone
        if (!confirm('Are you sure you want to delete only this milestone?')) return;
        const msIndex = li.milestones.findIndex(m => m.id == msId);
        if (msIndex !== -1) {
            li.milestones.splice(msIndex, 1);
        }
    }

    // Re-render the table
    // Re-render the table
    console.log('[DEBUG] deleteLineItem called. Setting hasUnsavedChanges = true');
    lineItemsState.hasUnsavedChanges = true;
    lineItemsState.saveButtonUnlocked = false; // Re-lock button on new changes
    renderLineItemsTable();
    updateMainPOValueFromMemory();
}

let isSavingLineItem = false;
let tempLineItemIdCounter = 1; // Temporary ID counter for in-memory items

// Save line item to memory only (not to database)
async function saveLineItemToDB(stayOnIdentification = false) {
    if (isSavingLineItem) return;
    isSavingLineItem = true;

    const saveBtn = document.getElementById('mainSaveBtn');
    const originalBtnText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = 'Saving...';
    }

    try {
        console.log("[saveLineItemToDB] Starting save process...", {
            poNumber: lineItemsState.poNumber,
            isEditing: lineItemsState.editingItemId
        });

        if (!lineItemsState.poNumber) throw new Error('No PO Number found in state.');

        // ========== STEP 1: Validate Line Item Identification & Specs fields FIRST ==========
        const liNo = document.getElementById('li_line_item_no').value.trim();
        const liDesc = document.getElementById('li_description').value.trim();
        const hsnValue = document.getElementById('li_hsn_sac_code').value.trim();
        const liQty = parseFloat(document.getElementById('li_li_quantity').value) || 0;

        if (!liNo) { alert('Field Required: Line#'); return; }
        if (!liDesc) { alert('Field Required: Project Description / Scope of Work'); return; }
        if (!hsnValue) { alert('Field Required: HSN/SAC Code'); return; }
        if (liQty <= 0) { alert('Field Required: Qty (must be greater than 0)'); return; }

        if (hsnValue.length !== 8 || isNaN(hsnValue)) {
            alert('HSN/SAC Code must be exactly 8 digits.');
            return;
        }

        // Check for duplicate Line Item Number (in memory)
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
            const msPrice = parseFloat(document.getElementById('ms_unit_price').value) || 0;
            const msPct = parseFloat(document.getElementById('ms_payment_cycle').value) || 0;
            const msTerms = document.getElementById('ms_payment_terms').value.trim();
            const msDocs = document.getElementById('ms_documents').value.trim();

            if (msNameInput && msQtyInput > 0 && msPrice > 0 && msPct > 0) {
                const currentMs = {
                    id: lineItemsState.editingMilestoneId || ('temp_ms_' + Date.now()), // Preserve ID if editing
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
                alert('You have unsaved details in the Financial Milestone section. Please either clear them or click "+ Add Another Milestone" to include them.');
                return;
            }
        }

        if (finalMilestones.length === 0) {
            alert('Please add at least one milestone using the "+ Add Another Milestone" button.');
            return;
        }

        // ========== STEP 3: Validate Integrity (Total Quantity Check) ==========
        const totalMilestoneQty = finalMilestones.reduce((sum, ms) => sum + (parseFloat(ms.quantity) || 0), 0);

        if (totalMilestoneQty <= 0) {
            alert('Milestone Qty cannot be empty. Please ensure at least one milestone has a quantity greater than 0.');
            return;
        }

        // Allow if total milestone qty <= line item qty (can add more milestones later)
        // Block only if total exceeds line item qty
        if (totalMilestoneQty > liQty) {
            alert(`Error: The sum of all Milestone Quantities (${totalMilestoneQty}) exceeds the Line Item Quantity (${liQty}). Please reduce milestone quantities.`);
            return;
        }

        // ========== STEP 4: Store in memory (not database) ==========
        // Enforce: Unit price of all milestones must be same as the first one
        if (finalMilestones.length > 0) {
            // SORTING FIX: Restore original order if we are editing
            if (lineItemsState.editingItemId) {
                const originalLi = lineItemsState.currentLineItems.find(i => i.id == lineItemsState.editingItemId);
                if (originalLi && originalLi.milestones) {
                    const orderMap = new Map(originalLi.milestones.map((m, i) => [m.id, i]));
                    finalMilestones.sort((a, b) => {
                        const idxA = orderMap.has(a.id) ? orderMap.get(a.id) : 999999;
                        const idxB = orderMap.has(b.id) ? orderMap.get(b.id) : 999999;
                        return idxA - idxB;
                    });
                }
            }

            const masterPrice = parseFloat(finalMilestones[0].unit_price) || 0;
            finalMilestones.forEach(ms => {
                ms.unit_price = masterPrice;
                // Re-calculate cycle value based on master price
                const msQty = parseFloat(ms.quantity) || 0;
                const msPct = parseFloat(ms.payment_cycle_pct) || 0;
                ms.cycle_value = ((msQty * masterPrice * msPct) / 100).toFixed(2);
            });
        }

        const lineItem = {
            id: lineItemsState.editingItemId || ('temp_' + tempLineItemIdCounter++),
            line_item_no: liNo,
            line_item_type: document.getElementById('li_line_item_type').value,
            description: liDesc,
            quantity: liQty, // Use the target quantity
            gst_rate: document.getElementById('li_gst_rate').value,
            hsn_sac_code: hsnValue,
            milestones: finalMilestones.map((ms, idx) => ({
                ...ms,
                id: ms.id || ('temp_ms_' + idx + '_' + Date.now())
            }))
        };

        if (lineItemsState.editingItemId) {
            // Update existing item in memory
            const idx = lineItemsState.currentLineItems.findIndex(item => item.id == lineItemsState.editingItemId);
            if (idx !== -1) {
                lineItemsState.currentLineItems[idx] = lineItem;
            }
        } else {
            // Add new item to memory
            lineItemsState.currentLineItems.push(lineItem);
        }

        // Determine if we should keep the form open for more milestones
        const isComplete = totalMilestoneQty === liQty;

        if (!isComplete) {
            // Partial save - keep identification fields and editing state
            lineItemsState.editingItemId = lineItem.id;
            lineItemsState.editingMilestoneId = null;
            lineItemsState.stagedMilestones = lineItem.milestones;

            resetMilestoneFields();

            // Update button to show we are still in "editing/adding" mode for this item
            if (saveBtn) {
                saveBtn.innerHTML = '🎯 Add Next Milestone';
                saveBtn.style.background = '#0ea5e9';
            }
        } else {
            // Complete save - full reset
            lineItemsState.stagedMilestones = [];
            resetEntireForm();

            if (saveBtn) {
                saveBtn.innerHTML = 'Save Line Item';
                saveBtn.style.background = 'var(--success-action)';
            }
        }

        if (saveBtn) saveBtn.disabled = false;

        // Render the updated table
        lineItemsState.hasUnsavedChanges = true;
        renderLineItemsTable();
        updateMainPOValueFromMemory();

        if (!isComplete) {
            alert(`Milestone added to grid (${totalMilestoneQty} / ${liQty}). Please add the remaining milestones for this line item.`);
        } else {
            alert('Line item fully specified and added to grid! Click "Save Purchase Order" to save everything to database.');
        }

    } catch (err) {
        console.error(err);
        alert('Error: ' + err.message);
    } finally {
        isSavingLineItem = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnText;
        }
    }
}

// Update PO value from in-memory line items
function updateMainPOValueFromMemory() {
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
    const displayField = document.getElementById('li_display_po_value');
    if (displayField) {
        displayField.value = total.toLocaleString('en-US', { minimumFractionDigits: 2 });
    }

    // Update main form PO Value field if it exists
    const mainPoValueField = document.getElementById('po_value');
    if (mainPoValueField) {
        mainPoValueField.value = formattedTotal;
    }

    // Trigger BG calculation if exists
    if (typeof window.calculateBgFd === 'function') {
        window.calculateBgFd();
    }

    // Trigger BG interaction toggle if exists
    if (typeof window.toggleBgBtn === 'function') {
        window.toggleBgBtn();
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

// ========== BILLING & PAYMENT SYSTEM (ADVANCED) ==========

const billingModalHTML = `
<div id="billingModal" class="li-modal-overlay">
    <div class="li-modal-card">
        <div class="li-modal-header">
            <h2 class="li-modal-title">🧾 Generate Invoice & Billing</h2>
            <button onclick="closeBillingModal()" class="li-modal-close" title="Close Workspace">&times;</button>
        </div>
        
        <div class="li-modal-body">
            <!-- Context Bar -->
            <div class="li-context-bar">
                <div class="li-context-item">
                    <label>PO REF:</label>
                    <input type="text" id="bill_po_number" readonly>
                </div>
                <div class="li-context-item">
                    <label>DATE:</label>
                    <input type="text" id="bill_po_date" readonly>
                </div>
                <div class="li-context-item">
                    <label>TOTAL VAL:</label>
                    <input type="text" id="bill_po_value" readonly>
                </div>
            </div>

            <!-- Main Layout: Top Form -> Middle Grid -> Bottom Actions -->
            <div class="li-form-container li-vertical-layout">
                <!-- Section 1: Invoice Generation Form -->
                <div class="form-block">
                    <div class="form-title">Invoice Details</div>
                    <div class="li-compact-grid" style="grid-template-columns: repeat(5, 1fr);">
                        <div class="li-field">
                            <label>Invoice No</label>
                            <input type="text" id="bill_invoice_no" placeholder="INV-001">
                        </div>
                        <div class="li-field">
                            <label>Invoice Date</label>
                            <input type="date" id="bill_invoice_date">
                        </div>
                        <div class="li-field">
                            <label>Taxable Val (A)</label>
                            <input type="number" id="bill_taxable_val" placeholder="0.00">
                        </div>
                         <div class="li-field">
                            <label>GST @18% (B)</label>
                            <input type="number" id="bill_gst_val" placeholder="0.00">
                        </div>
                        <div class="li-field">
                            <label>Total (C=A+B)</label>
                            <input type="number" id="bill_total_val" readonly style="font-weight: 700; background-color: #f8fafc;">
                        </div>
                        
                        <!-- Row 2 -->
                        <div class="li-field">
                             <label>Credit Period (Days)</label>
                             <input type="number" id="bill_credit_period" value="0" placeholder="e.g. 30">
                        </div>
                        <div class="li-field">
                             <label>Due Date</label>
                             <input type="text" id="bill_due_date" readonly style="background-color: #f1f5f9;">
                        </div>
                        <div class="li-field">
                            <label>Status</label>
                            <select id="bill_status">
                                <option value="Pending">Pending</option>
                                <option value="Sent">Sent</option>
                                <option value="Paid">Paid</option>
                                <option value="Overdue">Overdue</option>
                                <option value="Hold">Hold</option>
                                <option value="Create">Create</option>
                                <option value="Cancel">Cancel</option>
                            </select>
                        </div>
                        <div class="li-field">
                            <label>Payment Rec</label>
                            <input type="number" id="bill_payment_rec" placeholder="0.00">
                        </div>
                        <div class="li-field full" style="grid-column: span 1;">
                            <label>Remarks</label>
                            <input type="text" id="bill_remarks" placeholder="Notes...">
                        </div>
                    </div>
                </div>

                <div class="tax-strip">Select rows below to include them in this invoice. Amounts will auto-sum unless overridden.</div>

                <!-- Section 2: Billing Grid -->
                <div class="li-table-wrapper" style="max-height: 250px;">
                    <table class="li-pro-table">
                        <thead>
                            <tr>
                                <th style="width: 30px;"><input type="checkbox" id="bill_select_all" onchange="toggleAllBillingRows(this)"></th>
                                <th style="width: 40px;">Line#</th>
                                <th>Description</th>
                                <th style="width: 40px;">Qty</th>
                                <th>Cycle Val</th>
                                <th>Milestone</th>
                                <th>Terms</th>
                                <th>Docs</th>
                                <th>Date</th>
                                <th>Inv No</th>
                                <th>Inv Date</th>
                                <th>Inv Amt</th>
                                <th>Paid</th>
                                <th>Pending</th>
                                <th>Remarks</th>
                            </tr>
                        </thead>
                        <tbody id="billingGridBody"></tbody>
                    </table>
                </div>
            </div>

             <!-- Footer Actions -->
             <div class="li-modal-footer">
                <button onclick="editBillingItem()" class="btn-pro btn-blue">Edit Invoice</button>
                <button onclick="cancelBillingItem()" class="btn-pro btn-orange" style="background-color: #ef4444;">Cancel Invoice</button>
                <button onclick="handlePaymentButtonClick()" class="btn-pro btn-blue" style="background-color: #0ea5e9;">Record Payment</button>
                <div style="width: 1px; height: 24px; background: #cbd5e1; margin: 0 0.5rem;"></div>
                <button onclick="saveBillingItem()" class="btn-pro btn-green">Save Invoice to DB</button>
            </div>
        </div>
    </div>
</div>
`;

const paymentModalHTML = `
<div id="paymentModal" class="li-modal-overlay" style="z-index: 100001;">
    <div class="li-modal-card" style="max-width: 1200px;">
        <div class="li-modal-header">
            <h2 class="li-modal-title">💸 PAYMENT RECORDING WORKSPACE</h2>
            <button onclick="closePaymentModal()" class="li-modal-close" title="Close Workspace">&times;</button>
        </div>
        
        <div class="li-modal-body">
            <!-- Context -->
            <div class="li-context-bar">
                <div class="li-context-item">
                    <label>PO REF:</label>
                    <input type="text" id="pay_po_number" readonly style="width: 180px;">
                </div>
                <div class="li-context-item">
                    <label>PO VALUE:</label>
                    <input type="text" id="pay_po_value" readonly style="width: 140px;">
                </div>
                <div class="li-context-item" style="flex:1;">
                    <span style="font-size: 0.75rem; color: #d97706;">⚠️ Verify TDS & Holds before saving.</span>
                </div>
            </div>

            <div class="li-form-container">
                <!-- Section 1: Target Invoice -->
                <div class="form-block">
                    <div class="form-title">Target Invoice</div>
                    <div class="li-compact-grid" style="grid-template-columns: 2fr 1fr 1fr;">
                        <div class="li-field">
                            <label>Select Invoice</label>
                            <select id="pay_invoice_no" onchange="searchInvoice()"></select>
                        </div>
                        <div class="li-field">
                            <label>Invoice Date</label>
                            <input type="text" id="pay_invoice_date" oninput="calculatePaymentFields()">
                        </div>
                         <div class="li-field">
                            <label>Asset Type</label>
                            <input type="text" id="pay_hw_sw" readonly style="background: #f1f5f9;">
                        </div>
                    </div>
                </div>

                <!-- Section 2: Financials & Deductions -->
                <div class="form-block">
                    <div class="form-title">Financial Breakdown & Deductions</div>
                    <div class="li-compact-grid" style="grid-template-columns: repeat(4, 1fr); gap: 0.75rem 1.25rem;">
                        <!-- Base Values -->
                        <div class="li-field">
                            <label>Taxable Val (A)</label>
                            <input type="number" id="pay_taxable_val" oninput="calculatePaymentFields()" style="font-weight: 600;">
                        </div>
                        <div class="li-field">
                            <label>GST Amount (B)</label>
                            <input type="number" id="pay_gst_val" oninput="calculatePaymentFields()">
                        </div>
                        <div class="li-field">
                            <label>Total Inv Val (C)</label>
                            <input type="number" id="pay_total_val" oninput="calculatePaymentFields()" style="font-weight: 700; color: #0f172a;">
                        </div>
                        <div class="li-field">
                             <label>Other Deduction Type</label>
                             <select id="pay_other_deduction_type">
                                 <option value="">Select Type</option>
                                 <option value="Late Delivery">Late Delivery</option>
                                 <option value="Penalty">Penalty</option>
                                 <option value="Security">Security</option>
                             </select>
                        </div>

                        <!-- Deductions -->
                        <div class="li-field">
                            <label>TDS IT % (X)</label>
                            <input type="number" id="pay_tds_x_pct" value="0" step="0.1" oninput="calculatePaymentFields()">
                        </div>
                        <div class="li-field">
                            <label>TDS GST % (Y)</label>
                            <input type="number" id="pay_tds_y_pct" value="0" step="0.1" oninput="calculatePaymentFields()">
                        </div>
                        <div class="li-field">
                            <label>GST Hold % (Z)</label>
                            <input type="number" id="pay_tds_z_pct" value="0" step="0.1" oninput="calculatePaymentFields()">
                        </div>
                        <div class="li-field">
                            <label>Other Ded. Amt (I)</label>
                            <input type="number" id="pay_other_deduction" value="0" oninput="calculatePaymentFields()">
                        </div>

                        <!-- Calcs -->
                        <div class="li-field">
                            <label>TDS IT Amt (D)</label>
                            <input type="number" id="pay_tds_income" readonly style="background: #fff1f2; color: #be123c;">
                        </div>
                         <div class="li-field">
                            <label>TDS GST Amt (E)</label>
                            <input type="number" id="pay_tds_gst" readonly style="background: #fff1f2; color: #be123c;">
                        </div>
                         <div class="li-field">
                            <label>GST Hold Amt (G)</label>
                            <input type="number" id="pay_gst_hold" readonly style="background: #fff1f2; color: #be123c;">
                        </div>
                        <div class="li-field">
                            <label>Net Rec. (F=C-D-E)</label>
                            <input type="number" id="pay_receivable" readonly style="background: #f0fdf4; font-weight: 700; color: #15803d;">
                        </div>
                    </div>

                    <!-- Final Results -->
                    <div class="li-compact-grid" style="margin-top: 0.5rem; grid-template-columns: 1fr 1fr;">
                         <div class="li-field">
                             <label style="color: #1e40af; font-weight: 700;">Actual Receivable (H = F - G)</label>
                             <input type="number" id="pay_actual_receivable" readonly style="background: #eff6ff; border: 1px solid #93c5fd; font-weight: 800; font-size: 1rem; color: #1e3a8a;">
                         </div>
                         <div class="li-field">
                             <label style="color: #c2410c; font-weight: 700;">Target Received (H - I)</label>
                             <input type="number" id="pay_target_received" readonly style="background: #fff7ed; border: 1px solid #fdba74; font-weight: 800; font-size: 1rem; color: #9a3412;">
                         </div>
                    </div>
                </div>

                <!-- Section 3: Receipt -->
                <div class="form-block" style="background: #fdfdfd;">
                    <div class="form-title">Payment Receipt Details</div>
                    <div class="li-compact-grid" style="grid-template-columns: repeat(3, 1fr);">
                        <div class="li-field">
                            <label style="font-weight: 700;">Amt Received</label>
                            <input type="number" id="pay_amount_received" oninput="calculatePaymentFields()">
                        </div>
                        <div class="li-field">
                            <label>Pymt Date</label>
                            <input type="date" id="pay_payment_date">
                        </div>
                         <div class="li-field">
                            <label>Mode / UTR</label>
                            <input type="text" id="pay_mode" placeholder="NEFT/RTGS...">
                        </div>
                        <div class="li-field full">
                            <label>Customer Remarks</label>
                            <input type="text" id="pay_customer_remarks" placeholder="Notes from client...">
                        </div>
                         <div class="li-field full">
                            <label>Internal Remarks</label>
                            <input type="text" id="pay_appolo_remarks" placeholder="Internal notes...">
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="li-modal-footer">
            <div style="flex: 1; font-size: 0.7rem; color: #64748b;">* Saving will update the "Paid" & "Pending" status in Billing Grid.</div>
            <button onclick="editPayment()" class="btn-pro btn-blue">Edit Payment</button>
            <button onclick="savePayment()" class="btn-pro btn-green">CONFIRM & SAVE PAYMENT</button>
        </div>
    </div>
</div>
`;



// Helper: Format Date to DD/MM/YYYY
function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return `${parts[2]} /${parts[1]}/${parts[0]} `;
    }
    return dateString;
}

let billingEditMode = false;
let paymentEditMode = false;
let currentInvoices = []; // Local cache of invoices for the current PO

function ensureBillingModalExists() {
    // If it exists, we just need to ensure the listener is there or refreshed
    if (document.getElementById('billingModal')) {
        // Refresh listener just in case (though it should persist)
        document.getElementById('bill_invoice_no')?.addEventListener('input', lookupInvoiceDetails);
        return;
    }

    // FORCE UPDATE: Remove existing modal to ensure latest HTML/Layout is applied
    const existing = document.getElementById('billingModal');
    if (existing) existing.remove();

    // Also remove payment modal if it exists to refresh it too
    const existingPay = document.getElementById('paymentModal');
    if (existingPay) existingPay.remove();

    document.body.insertAdjacentHTML('beforeend', billingModalHTML);
    document.body.insertAdjacentHTML('beforeend', paymentModalHTML);

    // Add specific listeners
    document.getElementById('bill_invoice_date')?.addEventListener('change', updateDueDate);
    document.getElementById('bill_credit_period')?.addEventListener('input', updateDueDate);
    document.getElementById('bill_invoice_no')?.addEventListener('input', lookupInvoiceDetails);

    console.log("Billing & Payment Modals (Re)Created");
}

function lookupInvoiceDetails() {
    const invNo = document.getElementById('bill_invoice_no').value.trim();
    if (!invNo) {
        resetBillingFormFieldsOnly();
        return;
    }

    const match = currentInvoices.find(inv => inv.invoice_no === invNo);
    if (match) {
        console.log("DEBUG: Auto-populating form for invoice", invNo);
        // Populate metadata form fields
        document.getElementById('bill_invoice_date').value = match.invoice_date || '';
        document.getElementById('bill_credit_period').value = match.credit_period || 0;
        document.getElementById('bill_status').value = match.status || 'Pending';
        document.getElementById('bill_remarks').value = match.remarks || '';
        document.getElementById('bill_payment_rec').value = match.payment_received || 0;

        // Auto-check all rows in the grid that match this invoice number
        const rows = document.querySelectorAll('#billingGridBody tr');
        rows.forEach(tr => {
            const rowInvNo = tr.querySelector('[data-field="invoice_no"]')?.textContent || '';
            const checkbox = tr.querySelector('.bill-row-select');
            if (checkbox && rowInvNo === invNo) {
                checkbox.checked = true;
            }
        });

        // Always recalculate sum based on the (newly updated) selection to prioritize Cycle Values
        recalculateAggregateValues();
        updateDueDate();
    } else {
        // No match found - clear metadata but keep/recalc aggregate sums for the new invoice
        resetBillingFormFieldsOnly();
        recalculateAggregateValues();
    }
}

// Helper to calculate aggregate taxable values across selected rows
function recalculateAggregateValues() {
    const checkboxes = document.querySelectorAll('.bill-row-select:checked');
    if (checkboxes.length === 0) {
        resetBillingForm();
        return;
    }

    let totalTaxableVal = 0;
    checkboxes.forEach(cb => {
        const row = cb.closest('tr');
        const cycleTd = row.cells[4];
        // Always prioritize the Milestone Cycle Value as the base for the Taxable Value (A)
        let rowTaxable = parseFloat(cycleTd?.getAttribute('data-cycle-val')) || 0;
        totalTaxableVal += rowTaxable;
    });

    document.getElementById('bill_taxable_val').value = totalTaxableVal.toFixed(2);
    calcBillTotal();
    updateDueDate();
}

// Helper to reset only the user-editable fields without clearing the invoice no itself
function resetBillingFormFieldsOnly() {
    document.getElementById('bill_invoice_date').value = '';
    document.getElementById('bill_taxable_val').value = '';
    document.getElementById('bill_gst_val').value = '';
    document.getElementById('bill_total_val').value = '';
    document.getElementById('bill_credit_period').value = '0';
    document.getElementById('bill_due_date').value = '';
    document.getElementById('bill_payment_rec').value = '0';
    document.getElementById('bill_remarks').value = '';
    document.getElementById('bill_status').value = 'Pending';
}

async function openBillingModal() {
    ensureBillingModalExists();

    const modal = document.getElementById('billingModal');
    if (modal) {
        modal.classList.add('open');
        billingEditMode = false;

        // Reset Selection State
        const allBoxes = document.querySelectorAll('.bill-row-select');
        allBoxes.forEach(b => { b.checked = false; });
        const allSelect = document.getElementById('bill_select_all');
        if (allSelect) { allSelect.checked = false; allSelect.disabled = false; }

        // Copy PO info
        const poNum = lineItemsState.poNumber || document.getElementById('li_display_po_number')?.value;
        const poDate = document.getElementById('li_display_po_date')?.value || '';
        const poValRaw = document.getElementById('li_display_po_value')?.value || '0';
        const poVal = poValRaw.replace(/[^0-9.]/g, '');

        document.getElementById('bill_po_number').value = poNum || '';
        document.getElementById('bill_po_date').value = poDate || '';
        document.getElementById('bill_po_value').value = poVal || '';

        // Load latest invoices from local state (synced via line-items fetch)
        currentInvoices = [];
        lineItemsState.currentLineItems.forEach(li => {
            if (li.milestones) {
                li.milestones.forEach(ms => {
                    if (ms.invoice_no) {
                        // Back-calculate Taxable/GST if not explicitly stored in milestones (which only has invoice_value aka Total)
                        // Assuming 18% GST for now as per form logic
                        const total = parseFloat(ms.invoice_value) || 0;
                        const taxable = (ms.taxable_value != null) ? parseFloat(ms.taxable_value) : (total / 1.18);
                        const gst = (ms.gst_value != null) ? parseFloat(ms.gst_value) : (total - taxable);

                        currentInvoices.push({
                            id: ms.id, // using milestone id as unique ref often
                            line_item_id: li.id,
                            milestone_id: ms.id,
                            invoice_no: ms.invoice_no,
                            invoice_date: ms.invoice_date,
                            total_value: total,
                            taxable_value: taxable,
                            gst_value: gst,
                            payment_received: parseFloat(ms.payment_received) || 0,
                            pending_amount: parseFloat(ms.pending_amount) || 0,
                            remarks: ms.remarks,
                            status: ms.status || 'Pending',
                            credit_period: ms.credit_period || 0,
                            due_date: null // Not strictly needed for payment logic display, can compute
                        });
                    }
                });
            }
        });

        // No fetch catch needed

        populateBillingGrid();
        resetBillingForm();
        console.log("DEBUG: openBillingModal completed");
    } else {
        console.error("DEBUG: billingModal NOT FOUND");
    }
}

function resetBillingForm() {
    document.getElementById('bill_invoice_no').value = '';
    document.getElementById('bill_invoice_date').value = '';
    document.getElementById('bill_taxable_val').value = '';
    document.getElementById('bill_gst_val').value = '';
    document.getElementById('bill_total_val').value = '';
    document.getElementById('bill_credit_period').value = '0';
    document.getElementById('bill_due_date').value = '';
    document.getElementById('bill_payment_rec').value = '0';
    document.getElementById('bill_remarks').value = '';
    document.getElementById('bill_status').value = 'Pending';
}

function populateBillingGrid() {
    console.log("DEBUG: populateBillingGrid called");
    const tbody = document.getElementById('billingGridBody');
    if (!tbody) {
        console.error("DEBUG: billingGridBody NOT FOUND in DOM");
        return;
    }

    tbody.innerHTML = ''; // Restore clearing to ensure fresh render with correct states
    console.log("DEBUG: lineItemsState.currentLineItems", lineItemsState.currentLineItems);

    lineItemsState.currentLineItems.forEach((li, idx) => {
        if (!li.milestones) return;
        li.milestones.forEach((ms, msIdx) => {
            const tr = document.createElement('tr');

            const invVal = (ms.invoice_value != null) ? parseFloat(ms.invoice_value).toFixed(2) : '';
            const taxVal = (ms.taxable_value != null) ? parseFloat(ms.taxable_value).toFixed(2) : '';
            const gstVal = (ms.gst_value != null) ? parseFloat(ms.gst_value).toFixed(2) : '';

            const payRecVal = (ms.payment_received != null) ? parseFloat(ms.payment_received) : 0;
            const invTotalVal = (ms.invoice_value != null) ? parseFloat(ms.invoice_value) : 0;
            const pendAmt = (invTotalVal - payRecVal).toFixed(2);
            const payRec = payRecVal.toFixed(2);

            const isLiTemp = li.id && typeof li.id === 'string' && li.id.startsWith('temp_');
            const isMsTemp = ms.id && typeof ms.id === 'string' && ms.id.startsWith('temp_');
            const isTemp = isLiTemp || isMsTemp;

            const displayRemarks = `${ms.credit_period || 0} | ${ms.status || 'Pending'} | ${ms.remarks || ''}`;
            tr.innerHTML = `
                <td><input type="checkbox" class="bill-row-select" data-li="${li.id}" data-ms="${ms.id}" onchange="handleBillingRowChange(this)" ${(ms.invoice_no || isTemp) ? 'disabled' : ''} title="${isTemp ? 'Save items to DB first' : ''}"></td>
                <td>${msIdx === 0 ? (li.line_item_no || (idx + 1)) : ''}</td>
                <td>${msIdx === 0 ? (li.description || '') : ''}</td>
                <td>${ms.quantity || ''}</td>
                <td data-cycle-val="${ms.cycle_value || 0}">${ms.cycle_value || ''}</td>
                <td>${ms.milestone_name || ''}</td>
                <td>${ms.payment_terms || '-'}</td>
                <td>${ms.documents || '-'}</td>
                <td>${ms.delivery_date || '-'}</td>
                <td><span data-field="invoice_no">${ms.invoice_no || ''}</span></td>
                <td><span data-field="invoice_date" data-raw-date="${ms.invoice_date || ''}">${formatDateToDDMMYYYY(ms.invoice_date) || ''}</span></td>
                <td><span data-field="invoice_value" data-taxable="${taxVal}" data-gst="${gstVal}">${invVal}</span></td>
                <td><span data-field="payment_received">${payRec}</span></td>
                <td><span class="pending-amt" data-li="${li.id}" data-ms="${ms.id}">${pendAmt}</span></td>
                <td title="${ms.remarks || ''}"><span data-field="remarks" data-raw-remarks="${ms.remarks || ''}" data-status="${ms.status || 'Pending'}" data-credit-period="${ms.credit_period || 0}">${(ms.remarks || '').length > 30 ? (ms.remarks || '').substring(0, 30) + '...' : (ms.remarks || '')}</span></td>
            `;
            tbody.appendChild(tr);
        });
    });
}

window.calcBillTotal = function () {
    const taxable = parseFloat(document.getElementById('bill_taxable_val')?.value) || 0;
    const gst = taxable * 0.18;
    document.getElementById('bill_gst_val').value = gst.toFixed(2);
    document.getElementById('bill_total_val').value = (taxable + gst).toFixed(2);
    document.getElementById('bill_total_val').value = (taxable + gst).toFixed(2);
    // After calc, sync to grid (but rely on syncFormToGrid mainly)
    // We don't call syncFormToGrid here to avoid loop if called from syncFormToGrid
}

// DECOUPLED: Updated from Form Inputs (does NOT run Auto-Sum)
window.syncFormToGrid = function () {
    // If user manually types Taxable Val, we trust it (unless >1 rows selected, see mapFormToGridRow)
    if (document.activeElement.id === 'bill_taxable_val') {
        calcBillTotal(); // Sync GST/Total fields in form first
    }
    const checkboxes = document.querySelectorAll('.bill-row-select:checked');
    checkboxes.forEach(cb => mapFormToGridRow(cb));
}

// DECOUPLED: Updated from Checkbox Selection (Runs Auto-Sum)
window.autoSumAndSync = function () {
    // Use the unified recalculate function to update the form's aggregate totals from selection
    recalculateAggregateValues();
}

window.updateDueDate = function () {
    const invDateVal = document.getElementById('bill_invoice_date')?.value;
    let credit = parseInt(document.getElementById('bill_credit_period')?.value) || 0;
    const dueField = document.getElementById('bill_due_date');

    if (!invDateVal || !dueField) return;

    // Use split to avoid timezone shifts
    const [y, m, d] = invDateVal.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + credit);

    const dy = date.getFullYear();
    const dm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    dueField.value = `${dy}-${dm}-${dd}`;
}

window.mapFormToGridRow = function (checkbox) {
    const tr = checkbox.closest('tr');
    if (!tr) return;

    const noSpan = tr.querySelector('[data-field="invoice_no"]');
    const dateSpan = tr.querySelector('[data-field="invoice_date"]');
    const valueSpan = tr.querySelector('[data-field="invoice_value"]');
    const paySpan = tr.querySelector('[data-field="payment_received"]');
    const remSpan = tr.querySelector('[data-field="remarks"]');
    const pendingSpan = tr.querySelector('.pending-amt');

    if (checkbox.checked) {
        const invNo = document.getElementById('bill_invoice_no').value;
        const invDate = document.getElementById('bill_invoice_date').value;
        const payRec = document.getElementById('bill_payment_rec').value;
        const remarks = document.getElementById('bill_remarks').value;
        const status = document.getElementById('bill_status').value;
        const credit = document.getElementById('bill_credit_period').value;

        // console.log("Mapping Form to Row:", { invNo, invDate, status });

        if (noSpan) noSpan.textContent = invNo;
        if (dateSpan) {
            dateSpan.textContent = formatDateToDDMMYYYY(invDate);
            dateSpan.setAttribute('data-raw-date', invDate);
        }
        if (valueSpan) {
            const checkboxes = document.querySelectorAll('.bill-row-select:checked');
            let applyRowCycleVal = false;

            // LOGIC FIX:
            // 1. If Multiple Rows Selected: We assume 'Bulk Invoice' -> Default to Row Cycle Values (Auto-Calc)
            //    to prevent applying the SUM total to EACH row.
            // 2. If Single Row Selected: We assume 'Precise Edit' -> Allow Form Override.
            if (!billingEditMode && checkboxes.length > 1) {
                applyRowCycleVal = true;
            }

            let rowTaxable, rowGst, rowTotal;

            if (applyRowCycleVal) {
                // Use Row Cycle Value (Ignore Form Override)
                const tr = checkbox.closest('tr');
                rowTaxable = parseFloat(tr.cells[4]?.textContent) || 0; // Use Cycle Value
            } else {
                // Use Form Value (Allow Override)
                rowTaxable = parseFloat(document.getElementById('bill_taxable_val').value) || 0;
            }

            rowGst = rowTaxable * 0.18;
            rowTotal = rowTaxable + rowGst;

            valueSpan.textContent = rowTotal.toFixed(2);
            valueSpan.setAttribute('data-taxable', rowTaxable.toFixed(2));
            valueSpan.setAttribute('data-gst', rowGst.toFixed(2));
        }
        if (paySpan) paySpan.textContent = payRec;
        if (remSpan) {
            const truncatedRemarks = remarks.length > 30 ? remarks.substring(0, 30) + '...' : remarks;
            remSpan.textContent = truncatedRemarks;
            remSpan.setAttribute('data-raw-remarks', remarks);
            remSpan.setAttribute('data-status', status);
            remSpan.setAttribute('data-credit-period', credit);
            remSpan.closest('td').setAttribute('title', remarks);
        }
        if (pendingSpan) {
            // Pending = Row Total - Paid
            const rowTotal = parseFloat(valueSpan.textContent) || 0;
            pendingSpan.textContent = (rowTotal - parseFloat(payRec || 0)).toFixed(2);
        }
    } else {
        // Restore from memory if unchecked
        const liId = checkbox.getAttribute('data-li');
        const msId = checkbox.getAttribute('data-ms');
        const li = lineItemsState.currentLineItems.find(i => i.id == liId);
        const ms = li?.milestones?.find(m => m.id == msId) || {};

        if (noSpan) noSpan.textContent = ms.invoice_no || '';
        if (dateSpan) {
            dateSpan.textContent = formatDateToDDMMYYYY(ms.invoice_date);
            dateSpan.setAttribute('data-raw-date', ms.invoice_date || '');
        }
        if (valueSpan) valueSpan.textContent = ms.invoice_value ? parseFloat(ms.invoice_value).toFixed(2) : '';
        if (paySpan) paySpan.textContent = ms.payment_received ? parseFloat(ms.payment_received).toFixed(2) : '';
        if (remSpan) {
            const fullRemarks = ms.remarks || '';
            const truncatedRemarks = fullRemarks.length > 30 ? fullRemarks.substring(0, 30) + '...' : fullRemarks;
            remSpan.textContent = truncatedRemarks;
            remSpan.setAttribute('data-raw-remarks', fullRemarks);
            remSpan.setAttribute('data-status', ms.status || 'Pending');
            remSpan.setAttribute('data-credit-period', ms.credit_period || 0);
            remSpan.closest('td').setAttribute('title', fullRemarks);
        }
        if (pendingSpan) pendingSpan.textContent = ms.pending_amount ? parseFloat(ms.pending_amount).toFixed(2) : '0.00';
    }
}

window.toggleAllBillingRows = function (selectAll) {
    const checkboxes = document.querySelectorAll('.bill-row-select');
    checkboxes.forEach(cb => {
        if (!cb.disabled) {
            cb.checked = selectAll.checked;
        }
    });
    // Trigger Auto-Sum Only Once
    autoSumAndSync();
}

window.handleBillingRowChange = function (checkbox) {
    const tr = checkbox.closest('tr');
    const checkedBoxes = document.querySelectorAll('.bill-row-select:checked');

    // 0. If no rows are checked, reset the entire form
    if (checkedBoxes.length === 0) {
        resetBillingForm();
        return;
    }

    // Internal Helper for Fallback Parsing
    const parseRemarksFallback = (remSpan) => {
        let status = remSpan?.getAttribute('data-status') || 'Pending';
        let credit = parseInt(remSpan?.getAttribute('data-credit-period')) || 0;
        let rawRemarks = remSpan?.getAttribute('data-raw-remarks') || '';

        if (rawRemarks.includes(' | ')) {
            const parts = rawRemarks.split(' | ');
            if (parts.length >= 2) {
                credit = parseInt(parts[0]) || 0;
                status = parts[1].trim();
                rawRemarks = parts.slice(2).join(' | ');
                return { status, credit, rawRemarks };
            }
        }
        return { status, credit, rawRemarks };
    };

    // 1. If checking a row, always populate the form from THAT row's data
    if (checkbox.checked) {
        const remSpan = tr.querySelector('[data-field="remarks"]');
        const valSpan = tr.querySelector('[data-field="invoice_value"]');
        const cycleTd = tr.cells[4];

        const invNo = tr.querySelector('[data-field="invoice_no"]')?.textContent || '';
        const invDate = tr.querySelector('[data-field="invoice_date"]')?.getAttribute('data-raw-date') || '';
        const paymentRec = tr.querySelector('[data-field="payment_received"]')?.textContent || '0';

        const { status, credit, rawRemarks } = parseRemarksFallback(remSpan);

        document.getElementById('bill_invoice_no').value = invNo;
        document.getElementById('bill_invoice_date').value = invDate;
        document.getElementById('bill_payment_rec').value = paymentRec;
        document.getElementById('bill_remarks').value = rawRemarks;
        document.getElementById('bill_status').value = status;
        document.getElementById('bill_credit_period').value = credit;
    }

    // 2. Aggregate Taxable Value across ALL checked rows
    recalculateAggregateValues();
}

window.editBillingItem = function () {
    billingEditMode = true;
    const boxes = document.querySelectorAll('.bill-row-select');
    boxes.forEach(cb => { cb.disabled = false; });
    const selectAll = document.getElementById('bill_select_all');
    if (selectAll) selectAll.disabled = false;
    alert("Edit Mode: Select rows to update their invoice details.");
}

window.cancelBillingItem = function () {
    if (confirm("Cancel selected invoices?")) {
        document.getElementById('bill_status').value = 'Cancel';
        updateCheckedBillingRows();
    }
}

async function saveBillingItem() {
    // Collect selected rows first to check if invoicing is needed
    const checkboxes = document.querySelectorAll('.bill-row-select:checked');
    if (checkboxes.length === 0) return alert("Select rows to save.");

    // NEW: Check for unsaved items (temporary IDs)
    for (let cb of checkboxes) {
        const liIdStr = cb.getAttribute('data-li') || "";
        const msIdStr = cb.getAttribute('data-ms') || "";
        if (liIdStr.startsWith('temp_') || msIdStr.startsWith('temp_')) {
            alert("Error: One or more selected items are not yet saved to the database.\n\nPlease click 'Save Items to DB' in the line items list behind this modal first.");
            return;
        }
    }

    // Validation (No individual prompts as per user request)
    const invNo = document.getElementById('bill_invoice_no').value.trim();
    const invDate = document.getElementById('bill_invoice_date').value;
    const remarks = document.getElementById('bill_remarks').value.trim();

    if (!invNo) {
        alert("Invoicing can't be done without an invoice number. Please enter Invoice No in the form.");
        document.getElementById('bill_invoice_no').focus();
        return;
    }
    if (!invDate) {
        alert("Please enter Invoice Date in the form.");
        document.getElementById('bill_invoice_date').focus();
        return;
    }

    // Ensure Due Date is updated
    updateDueDate();

    // CRITICAL: Sync form values to grid BEFORE collecting data
    syncFormToGrid();

    const poNum = lineItemsState.poNumber;
    const rows = document.querySelectorAll('#billingGridBody tr');
    const toSave = [];

    rows.forEach(tr => {
        const cb = tr.querySelector('.bill-row-select');
        if (!cb || !cb.checked) return;

        const valSpan = tr.querySelector('[data-field="invoice_value"]');
        const remSpan = tr.querySelector('[data-field="remarks"]');
        const dateSpan = tr.querySelector('[data-field="invoice_date"]');

        toSave.push({
            line_item_id: cb.getAttribute('data-li'),
            milestone_id: cb.getAttribute('data-ms'),
            invoice_no: tr.querySelector('[data-field="invoice_no"]').textContent,
            invoice_date: dateSpan.getAttribute('data-raw-date') || dateSpan.textContent,
            taxable_value: parseFloat(valSpan.getAttribute('data-taxable')) || 0,
            gst_value: parseFloat(valSpan.getAttribute('data-gst')) || 0,
            total_value: parseFloat(valSpan.textContent) || 0,
            credit_period: parseInt(remSpan.getAttribute('data-credit-period')) || 0,
            due_date: document.getElementById('bill_due_date').value,
            payment_received: parseFloat(tr.querySelector('[data-field="payment_received"]').textContent) || 0,
            pending_amount: parseFloat(tr.querySelector('.pending-amt').textContent) || 0,
            status: remSpan.getAttribute('data-status'),
            remarks: remSpan.getAttribute('data-raw-remarks')
        });
    });

    if (toSave.length === 0) return alert("Select rows to save.");

    try {
        const res = await api.post(`/purchase-orders/${encodeURIComponent(poNum)}/invoices`, toSave);
        if (!res.error) {
            alert("Invoices saved successfully!");

            // SYNC LOCAL STATE: Update lineItemsState with the saved data
            console.log("DEBUG: syncing local state with", toSave);
            let syncedCount = 0;
            toSave.forEach(savedItem => {
                const li = lineItemsState.currentLineItems.find(l => l.id == savedItem.line_item_id);
                if (li && li.milestones) {
                    const ms = li.milestones.find(m => m.id == savedItem.milestone_id);
                    if (ms) {
                        console.log("DEBUG: Updating MS", ms.id, "with", savedItem);
                        ms.invoice_no = savedItem.invoice_no;
                        ms.invoice_date = savedItem.invoice_date;
                        ms.invoice_value = savedItem.total_value;
                        ms.taxable_value = savedItem.taxable_value;
                        ms.gst_value = savedItem.gst_value;
                        ms.payment_received = savedItem.payment_received;
                        ms.pending_amount = savedItem.pending_amount;
                        ms.status = savedItem.status;
                        ms.remarks = savedItem.remarks;
                        ms.credit_period = savedItem.credit_period;
                        syncedCount++;
                    } else {
                        console.error("DEBUG: Milestone not found for ID", savedItem.milestone_id);
                    }
                } else {
                    console.error("DEBUG: Line item not found for ID", savedItem.line_item_id);
                }
            });
            console.log("DEBUG: Synced items count:", syncedCount);

            openBillingModal(); // Refresh UI with updated state
        } else alert("Error: " + res.error);
    } catch (e) { alert("Network Error"); }
}

// ========== PAYMENT LOGIC ==========

function openPaymentModal() {
    ensureBillingModalExists(); // Payment modal is part of it

    // START FIX: Keep Billing Modal open in background (stacked)
    // document.getElementById('billingModal').classList.remove('open'); 

    const payModal = document.getElementById('paymentModal');
    payModal.classList.add('open');
    payModal.style.zIndex = "5001"; // Ensure it is above Billing Modal (5000)

    populateInvoiceDropdown();
    resetPaymentForm();
    paymentEditMode = false;

    // Set PO info
    document.getElementById('pay_po_number').value = lineItemsState.poNumber || '';
    const poValRaw = document.getElementById('li_display_po_value')?.value || '0';
    document.getElementById('pay_po_value').value = poValRaw.replace(/[^0-9.]/g, '');
}

function closePaymentModal() {
    const payModal = document.getElementById('paymentModal');
    payModal.classList.remove('open');
    payModal.style.zIndex = ""; // Reset z-index

    // No need to re-open billingModal as it was never closed.
    // Refresh the grid to show updated Paid/Pending amounts
    populateBillingGrid();
}

function resetPaymentForm() {
    const ids = [
        'pay_invoice_date', 'pay_hw_sw', 'pay_taxable_val', 'pay_gst_val', 'pay_total_val',
        'pay_tds_income', 'pay_tds_gst', 'pay_receivable', 'pay_gst_hold', 'pay_actual_receivable',
        'pay_target_received', 'pay_amount_received', 'pay_payment_date', 'pay_mode',
        'pay_customer_remarks', 'pay_appolo_remarks', 'pay_other_deduction_type'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Reset percentages and deduction amount to 0
    ['pay_tds_x_pct', 'pay_tds_y_pct', 'pay_tds_z_pct', 'pay_other_deduction', 'pay_amount_received'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 0;
    });
}

function populateInvoiceDropdown() {
    const select = document.getElementById('pay_invoice_no');
    if (!select) return;
    select.innerHTML = '<option value="">Select Invoice</option>';

    const uniqueInvoices = new Set();
    currentInvoices.forEach(inv => { if (inv.invoice_no) uniqueInvoices.add(inv.invoice_no); });

    [...uniqueInvoices].sort().forEach(no => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = no;
        select.appendChild(opt);
    });
}

async function searchInvoice() {
    const no = document.getElementById('pay_invoice_no').value;
    const inv = currentInvoices.find(i => i.invoice_no === no);
    if (!inv) {
        resetPaymentForm();
        calculatePaymentFields();
        return;
    }

    document.getElementById('pay_invoice_date').value = formatDateToDDMMYYYY(inv.invoice_date);
    document.getElementById('pay_taxable_val').value = inv.taxable_value.toFixed(2);
    document.getElementById('pay_gst_val').value = inv.gst_value.toFixed(2);
    document.getElementById('pay_total_val').value = inv.total_value.toFixed(2);

    const li = lineItemsState.currentLineItems.find(l => l.id == inv.line_item_id);
    document.getElementById('pay_hw_sw').value = li?.line_item_type || '';

    // NEW: Pull existing payment record if any
    try {
        const payRes = await api.get(`/payments?invoice_no=${encodeURIComponent(no)}&po_number=${encodeURIComponent(lineItemsState.poNumber)}`);
        if (payRes && payRes.payments && payRes.payments.length > 0) {
            const p = payRes.payments[0]; // Get most recent
            document.getElementById('pay_tds_x_pct').value = p.tds_income_pct || 0;
            document.getElementById('pay_tds_y_pct').value = p.tds_gst_pct || 0;
            document.getElementById('pay_tds_z_pct').value = p.gst_hold_pct || 0;
            document.getElementById('pay_other_deduction').value = p.other_deduction || 0;
            document.getElementById('pay_other_deduction_type').value = p.other_deduction_type || '';
            document.getElementById('pay_amount_received').value = p.amount_received || 0;
            document.getElementById('pay_payment_date').value = p.payment_date || '';
            document.getElementById('pay_mode').value = p.payment_mode || '';
            document.getElementById('pay_customer_remarks').value = p.customer_remarks || '';
            document.getElementById('pay_appolo_remarks').value = p.internal_remarks || '';
        } else {
            // Default if not found
            document.getElementById('pay_tds_x_pct').value = 0;
            document.getElementById('pay_tds_y_pct').value = 0;
            document.getElementById('pay_tds_z_pct').value = 0;
            document.getElementById('pay_other_deduction').value = 0;
            document.getElementById('pay_amount_received').value = 0;
            document.getElementById('pay_payment_date').value = '';
            document.getElementById('pay_mode').value = '';
            document.getElementById('pay_customer_remarks').value = '';
            document.getElementById('pay_appolo_remarks').value = '';
        }
    } catch (e) {
        console.error("Error fetching previous payment:", e);
    }

    calculatePaymentFields();
}

window.calculatePaymentFields = function () {
    const A = parseFloat(document.getElementById('pay_taxable_val').value) || 0;
    const B = parseFloat(document.getElementById('pay_gst_val').value) || 0;
    const C = parseFloat(document.getElementById('pay_total_val').value) || 0;
    const X = parseFloat(document.getElementById('pay_tds_x_pct').value) || 0;
    const Y = parseFloat(document.getElementById('pay_tds_y_pct').value) || 0;
    const Z = parseFloat(document.getElementById('pay_tds_z_pct').value) || 0;
    const I = parseFloat(document.getElementById('pay_other_deduction').value) || 0;

    const D = A * (X / 100);
    const E = A * (Y / 100);
    const F = C - D - E;
    const G = B * (Z / 100);
    const H = F - G; // Actual Receivable Amount
    const target = H - I; // Target Received Amount

    document.getElementById('pay_tds_income').value = D.toFixed(2);
    document.getElementById('pay_tds_gst').value = E.toFixed(2);
    document.getElementById('pay_receivable').value = F.toFixed(2);
    document.getElementById('pay_gst_hold').value = G.toFixed(2);
    document.getElementById('pay_actual_receivable').value = H.toFixed(2);
    if (document.getElementById('pay_target_received')) {
        document.getElementById('pay_target_received').value = target.toFixed(2);
    }

    const received = parseFloat(document.getElementById('pay_amount_received').value) || 0;
    const diff = Math.abs(received - target);

    document.getElementById('pay_amount_received').style.background = (diff > 0.1 && received > 0) ? '#ffcdd2' : 'white';
}

function handlePaymentButtonClick() {
    const selected = document.querySelector('.bill-row-select:checked');
    openPaymentModal();
    if (selected) {
        const tr = selected.closest('tr');
        const invNo = tr.querySelector('[data-field="invoice_no"]')?.textContent;
        if (invNo) {
            setTimeout(() => {
                document.getElementById('pay_invoice_no').value = invNo;
                searchInvoice();
            }, 100);
        }
    }
}

async function savePayment() {
    const no = document.getElementById('pay_invoice_no').value;
    if (!no) return alert("Select invoice");

    const inv = currentInvoices.find(i => i.invoice_no === no);
    if (!inv) return alert("Invoice data not found.");

    const amountReceived = parseFloat(document.getElementById('pay_amount_received').value) || 0;
    const actualReceivable = parseFloat(document.getElementById('pay_actual_receivable').value) || 0;
    const otherDed = parseFloat(document.getElementById('pay_other_deduction').value) || 0;
    const target = actualReceivable - otherDed;

    // Calculate Pending Amount: What's left to collect from the target
    const pendingAmount = Math.max(0, target - amountReceived);

    // Collect all payment form fields
    const tdsIncomePct = parseFloat(document.getElementById('pay_tds_x_pct').value) || 0;
    const tdsGstPct = parseFloat(document.getElementById('pay_tds_y_pct').value) || 0;
    const gstHoldPct = parseFloat(document.getElementById('pay_tds_z_pct').value) || 0;
    const tdsIncomeAmt = parseFloat(document.getElementById('pay_tds_income').value) || 0;
    const tdsGstAmt = parseFloat(document.getElementById('pay_tds_gst').value) || 0;
    const gstHoldAmt = parseFloat(document.getElementById('pay_gst_hold').value) || 0;
    const netReceivable = parseFloat(document.getElementById('pay_receivable').value) || 0;
    const paymentDate = document.getElementById('pay_payment_date').value;
    const paymentMode = document.getElementById('pay_mode').value;
    const custRem = document.getElementById('pay_customer_remarks').value;
    const appoloRem = document.getElementById('pay_appolo_remarks').value;
    const dedType = document.getElementById('pay_other_deduction_type').value;
    const payDetails = `[Payment] TDS-IT: ${tdsIncomeAmt}, TDS-GST: ${tdsGstAmt}, GST-Hold: ${gstHoldAmt}, Other(${dedType}): ${otherDed}`;
    const cleanRemarks = `${custRem} | ${appoloRem} | ${payDetails}`;

    const poNum = lineItemsState.poNumber;

    // Helper to ensure YYYY-MM-DD for backend
    const rawDate = document.getElementById('pay_invoice_date').value;
    let formattedInvoiceDate = rawDate;
    if (rawDate.includes('/')) {
        const parts = rawDate.split('/');
        if (parts.length === 3) formattedInvoiceDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    // Payload for invoices endpoint: Update ALL milestones sharing THIS invoice_no
    const invoiceNo = document.getElementById('pay_invoice_no').value;
    const matchingInvs = currentInvoices.filter(i => i.invoice_no === invoiceNo);

    const toSaveInvoices = matchingInvs.map(mInv => {
        // PRESERVE BILLING REMARKS STRICTLY:
        // User Requirement: "The billing remarks should only show billing remarks not the payment remarks."
        // So we keep the existing remarks EXACTLY as they are.

        return {
            ...mInv,
            invoice_no: invoiceNo,
            invoice_date: formattedInvoiceDate,
            taxable_value: parseFloat(document.getElementById('pay_taxable_val').value) || 0,
            gst_value: parseFloat(document.getElementById('pay_gst_val').value) || 0,
            total_value: parseFloat(document.getElementById('pay_total_val').value) || 0,
            payment_received: amountReceived,
            pending_amount: pendingAmount,
            status: (pendingAmount <= 1) ? 'Paid' : 'Partially Paid',
            remarks: mInv.remarks // Keep original remarks untouched
        };
    });

    if (toSaveInvoices.length === 0) {
        alert("No invoice data found for this number.");
        return;
    }

    // Payload for payments endpoint (new table)
    const paymentRecord = {
        invoice_no: invoiceNo,
        po_number: poNum,
        invoice_date: formattedInvoiceDate,
        taxable_value: toSaveInvoices[0].taxable_value,
        gst_value: toSaveInvoices[0].gst_value,
        total_value: toSaveInvoices[0].total_value,
        tds_income_pct: tdsIncomePct,
        tds_gst_pct: tdsGstPct,
        gst_hold_pct: gstHoldPct,
        other_deduction: otherDed,
        tds_income_amt: tdsIncomeAmt,
        tds_gst_amt: tdsGstAmt,
        gst_hold_amt: gstHoldAmt,
        net_receivable: netReceivable,
        actual_receivable: actualReceivable,
        amount_received: amountReceived,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        customer_remarks: custRem,
        internal_remarks: appoloRem,
        other_deduction_type: dedType
    };

    try {
        // Save to invoices (update milestone/invoice status)
        const res = await api.post(`/purchase-orders/${encodeURIComponent(poNum)}/invoices`, toSaveInvoices);

        // Save to payments table (new payment record)
        const payRes = await api.post('/payments', paymentRecord);

        if (!res.error && !payRes.error) {
            alert("Payment recorded successfully!");

            // UPDATE LOCAL STATE for all matching milestones
            lineItemsState.currentLineItems.forEach(li => {
                li.milestones?.forEach(ms => {
                    if (ms.invoice_no === invoiceNo) {
                        ms.payment_received = amountReceived;
                        ms.pending_amount = pendingAmount;
                        ms.status = (pendingAmount <= 1) ? 'Paid' : 'Partially Paid';
                        // ms.remarks = cleanRemarks; // REVERTED: Do not update UI with payment remarks
                    }
                });
            });

            closePaymentModal();
            populateBillingGrid();
        } else {
            alert("Error saving payment: " + (res.error || payRes.error));
        }
    } catch (e) {
        console.error(e);
        alert("Network Error during Payment Save");
    }
}

function editPayment() { paymentEditMode = true; alert("Edit mode enabled"); }
function closeBillingModal() { document.getElementById('billingModal').classList.remove('open'); }
function recordPayment() { handlePaymentButtonClick(); }
function openBillingPage() { openBillingModal(); }
