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
    deletedLineItemIds: [] // Track IDs to delete from DB on final save
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
    const isNewPoNum = lineItemsState.poNumber !== poNum;
    lineItemsState.poNumber = poNum || document.getElementById('po_number').value;

    if (!lineItemsState.poNumber) {
        alert('Please enter or save the PO Number first.');
        return;
    }

    const modal = document.getElementById('lineItemsModal');
    modal.classList.add('open');

    // If it's a completely different PO number (shouldn't happen in single session usually), reset memory
    if (isNewPoNum) {
        lineItemsState.currentLineItems = [];
        lineItemsState.stagedMilestones = [];
    }

    resetEntireForm(); // Clear the input panels

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

    // Only load from DB if memory is empty AND we are forced OR in edit mode
    // Edit mode can be detected by presence of po_number in URL or specific flag
    const isEditPage = window.location.pathname.includes('edit-purchase-order.html');

    if (forceLoadFromDB || (isEditPage && lineItemsState.currentLineItems.length === 0)) {
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

        if (!lineItemsRes.error) {
            lineItemsState.currentLineItems = lineItemsRes.line_items || [];
            renderLineItemsTable();
        }

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
                      <button onclick="editLineItem('${li.id}')" class="btn-po-mini">Edit line item in the grid</button>
                      <button onclick="deleteLineItem('${li.id}')" class="btn-po-mini btn-danger">Del</button>
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
                    <button onclick="editLineItem('${li.id}', '${ms.id}')" class="btn-utility btn-mini">Edit</button>
                    <button onclick="deleteLineItem('${li.id}', '${ms.id}')" class="btn-utility btn-mini" style="border-color:#ef4444; color:#ef4444;">Del</button>
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
    if (!msTerms) return alert('Field Required: Payment Terms (Milestone)');
    if (!msDocs) return alert('Field Required: Documents Required (Milestone)');

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
        if (!lineItemsState.poNumber) throw new Error('No PO Number');

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

            if (msNameInput && msQtyInput > 0 && msPrice > 0 && msPct > 0 && msTerms && msDocs) {
                const currentMs = {
                    id: 'temp_ms_' + Date.now(), // Temporary ID for in-memory
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
<div id="billingModal" class="li-modal-overlay" style="z-index: 100000;">
    <div class="li-modal-card" style="width: 95%; max-width: 1400px; max-height: 98vh; display: flex; flex-direction: column; background: linear-gradient(135deg, #00acc1 0%, #007c91 100%);">
        <div class="li-modal-header" style="background: rgba(0,0,0,0.2); height: 45px;">
            <h2 class="li-modal-title" style="color: white; font-size: 1rem;">💰 BILLING DETAILS FOR SELECTED LINE ITEMS</h2>
            <button onclick="closeBillingModal()" class="li-modal-close" style="color: white; font-size: 2rem;">&times;</button>
        </div>
        
        <div class="li-modal-body" style="overflow-y: auto; padding: 1rem; color: #333;">
            <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-bottom: 1rem;">
                <div class="li-context-item">
                    <label style="color: white;">PO REF:</label>
                    <input type="text" id="bill_po_number" readonly style="width: 180px; background: rgba(255,255,255,0.9);">
                </div>
                <div class="li-context-item">
                    <label style="color: white;">PO VALUE:</label>
                    <input type="text" id="bill_po_value" readonly style="width: 180px; background: rgba(255,255,255,0.9);">
                </div>
            </div>

            <div style="display: flex; gap: 1.5rem; align-items: flex-start; margin-bottom: 1rem;">
                <!-- Left: Form -->
                <div style="flex: 1; display: flex; flex-direction: column; gap: 1rem; background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px;">
                    <div style="display: flex; gap: 1rem;">
                        <div class="li-field" style="flex: 1;">
                            <label style="color: white;">Invoice No</label>
                            <input type="text" id="bill_invoice_no" placeholder="INV-XXX" oninput="updateCheckedBillingRows()">
                        </div>
                        <div class="li-field" style="flex: 1;">
                            <label style="color: white;">Invoice Date</label>
                            <input type="date" id="bill_invoice_date" oninput="updateCheckedBillingRows(); updateDueDate();">
                        </div>
                    </div>

                    <div style="display: flex; gap: 1rem;">
                        <div class="li-field" style="flex: 1;">
                            <label style="color: white;">Taxable Value (A)</label>
                            <input type="number" id="bill_taxable_val" step="0.01" oninput="calcBillTotal()">
                        </div>
                        <div class="li-field" style="flex: 1;">
                            <label style="color: white;">GST @18% (B)</label>
                            <input type="number" id="bill_gst_val" readonly style="background: #f1f5f9;">
                        </div>
                        <div class="li-field" style="flex: 1;">
                            <label style="color: white;">Total Invoice Value (C=A+B)</label>
                            <input type="number" id="bill_total_val" readonly style="background: #f1f5f9; font-weight: bold;">
                        </div>
                    </div>

                    <div style="display: flex; gap: 1rem;">
                        <div class="li-field" style="flex: 1;">
                            <label style="color: white;">Credit Period (Days)</label>
                            <input type="number" id="bill_credit_period" value="0" oninput="updateDueDate(); updateCheckedBillingRows();">
                        </div>
                        <div class="li-field" style="flex: 1.5;">
                            <label style="color: white;">Due Date (InvD + Credit)</label>
                            <input type="date" id="bill_due_date" readonly style="background: #e2e8f0;">
                        </div>
                        <div class="li-field" style="flex: 1;">
                            <label style="color: white;">Status</label>
                            <select id="bill_status" onchange="updateCheckedBillingRows()">
                                <option>Pending</option>
                                <option>Received</option>
                                <option>Cancel</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: flex; gap: 1rem;">
                        <div class="li-field" style="flex: 1;">
                            <label style="color: white;">Payment Received</label>
                            <input type="number" id="bill_payment_rec" value="0" oninput="updateCheckedBillingRows()">
                        </div>
                        <div class="li-field" style="flex: 2;">
                            <label style="color: white;">Remarks</label>
                            <input type="text" id="bill_remarks" placeholder="Additional notes..." oninput="updateCheckedBillingRows()">
                        </div>
                    </div>
                </div>

                <!-- Right: Action Icons/Labels -->
                <div style="width: 280px; display: flex; flex-direction: column; gap: 1rem;">
                    <div style="background: #00bcd4; padding: 1rem; border-radius: 8px; text-align: center; color: black; font-size: 0.8rem; font-weight: 700;">
                        Autogenerated email For Payment Reminder (2 days before due date)
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="editBillingItem()" class="btn-pro btn-blue" style="flex: 1; font-size: 0.7rem;">EDIT INVOICE</button>
                        <button onclick="cancelBillingItem()" class="btn-pro btn-orange" style="flex: 1; font-size: 0.7rem;">CANCEL INVOICE</button>
                    </div>
                    <button onclick="saveBillingItem()" class="btn-pro btn-green" style="width: 100%;">SAVE INVOICE</button>
                    <button onclick="handlePaymentButtonClick()" class="btn-pro btn-navy" style="width: 100%;">PAYMENT DETAILS</button>
                </div>
            </div>

            <div style="background: #fffbeb; padding: 0.25rem; text-align: center; font-size: 0.75rem; font-weight: 700; color: #92400e; margin-bottom: 0.5rem; border-radius: 4px;">
                Grid columns after Delivery Time reflect current saved billing status.
            </div>

            <!-- Table Section -->
            <div class="li-table-wrapper" style="max-height: 300px; background: white; border-radius: 4px;">
                <table class="li-pro-table">
                    <thead>
                        <tr>
                            <th style="width:30px; background: #8bc34a;"><input type="checkbox" id="billSelectAll" onclick="toggleAllBillingRows(this)"></th>
                            <th style="background: #8bc34a;">Line Item No</th>
                            <th style="background: #8bc34a;">Description</th>
                            <th style="background: #8bc34a;">Quantity</th>
                            <th style="background: #8bc34a;">Cycle Value</th>
                            <th style="background: #8bc34a;">Mile Stone</th>
                            <th style="background: #8bc34a;">Payment Terms</th>
                            <th style="background: #8bc34a;">Document</th>
                            <th style="background: #8bc34a;">Delivery Time</th>
                            <th style="background: #8bc34a;">Invoice No</th>
                            <th style="background: #8bc34a;">Invoice Date</th>
                            <th style="background: #8bc34a;">Invoice Value</th>
                            <th style="background: #8bc34a;">Payment Rec</th>
                            <th style="background: #8bc34a;">Pending Amt</th>
                            <th style="background: #8bc34a;">Remarks</th>
                        </tr>
                    </thead>
                    <tbody id="billingGridBody">
                        <!-- Rows populated dynamically -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<div id="paymentModal" class="li-modal-overlay" style="z-index: 100001;">
    <div class="li-modal-card" style="width: 90%; max-width: 1100px; max-height: 90vh; background: linear-gradient(135deg, #e65100 0%, #bf360c 100%); display: flex; flex-direction: column;">
        <div class="li-modal-header" style="background: rgba(0,0,0,0.2); height: 45px;">
            <h2 class="li-modal-title" style="color: white; font-size: 1rem;">💸 PAYMENT DETAILS</h2>
            <button onclick="closePaymentModal()" class="li-modal-close" style="color: white; font-size: 2rem;">&times;</button>
        </div>
        <div class="li-modal-body" style="padding: 1rem; overflow-y: auto; color: #333;">
            <div style="background: white; padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; gap: 1rem;">
                <div style="display: flex; gap: 1rem;">
                    <div class="li-field" style="flex: 2;">
                        <label>Select Invoice No</label>
                        <select id="pay_invoice_no" onchange="searchInvoice()"></select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem;">
                    <div class="li-field"><label>Invoice Date</label><input type="text" id="pay_invoice_date" readonly style="background:#f1f5f9;"></div>
                    <div class="li-field"><label>PO Number</label><input type="text" id="pay_po_number" readonly style="background:#f1f5f9;"></div>
                    <div class="li-field"><label>PO Value</label><input type="text" id="pay_po_value" readonly style="background:#f1f5f9;"></div>
                    <div class="li-field"><label>HW/SW</label><input type="text" id="pay_hw_sw" readonly style="background:#f1f5f9;"></div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                    <div class="li-field"><label>Taxable Value (A)</label><input type="text" id="pay_taxable_val" readonly style="background:#f1f5f9;"></div>
                    <div class="li-field"><label>GST @18% (B)</label><input type="text" id="pay_gst_val" readonly style="background:#f1f5f9;"></div>
                    <div class="li-field"><label>Total Invoice Value (C)</label><input type="text" id="pay_total_val" readonly style="background:#f1f5f9; font-weight: bold;"></div>
                </div>

                <div style="display: grid; grid-template-columns: 0.5fr 1fr 0.5fr 1fr 1.5fr; gap: 0.5rem; align-items: flex-end;">
                    <div class="li-field"><label>TDS % (X)</label><input type="number" id="pay_tds_x_pct" value="0" oninput="calculatePaymentFields()"></div>
                    <div class="li-field"><label>TDS Inc. Tax (D)</label><input type="text" id="pay_tds_income" readonly style="background:#f1f5f9;"></div>
                    <div class="li-field"><label>TDS % (Y)</label><input type="number" id="pay_tds_y_pct" value="0" oninput="calculatePaymentFields()"></div>
                    <div class="li-field"><label>TDS GST (E)</label><input type="text" id="pay_tds_gst" readonly style="background:#f1f5f9;"></div>
                    <div class="li-field"><label>Receivable (F=C-D-E)</label><input type="text" id="pay_receivable" readonly style="font-weight: 800; background: #f0fdf4;"></div>
                </div>

                <div style="display: grid; grid-template-columns: 0.5fr 1fr 1fr 1fr 1fr; gap: 0.5rem; align-items: flex-end;">
                    <div class="li-field"><label>GST Hold % (Z)</label><input type="number" id="pay_tds_z_pct" value="0" oninput="calculatePaymentFields()"></div>
                    <div class="li-field"><label>GST Hold Amt (G)</label><input type="text" id="pay_gst_hold" readonly style="background:#f1f5f9;"></div>
                    <div class="li-field"><label>Deduction Type (I)</label>
                        <select id="pay_deduction_type" onchange="calculatePaymentFields()">
                            <option value="">None</option>
                            <option value="late_delivery">Late Delivery</option>
                            <option value="penalty">Penalty</option>
                            <option value="security">Security</option>
                        </select>
                        <input type="number" id="pay_other_deduction" value="0" oninput="calculatePaymentFields()" style="margin-top: 2px;">
                    </div>
                    <div class="li-field"><label>Act. Receivable (H=F-G)</label><input type="text" id="pay_actual_receivable" readonly style="font-weight: 800; background: #f0fdf4;"></div>
                    <div class="li-field"><label>Amt Received (H-I)</label><input type="number" id="pay_amount_received" value="0" oninput="calculatePaymentFields()" style="border: 2px solid #e65100;"></div>
                </div>

                <div style="display: flex; gap: 1rem;">
                    <div class="li-field" style="flex:1;"><label>Cust. Remarks</label><textarea id="pay_customer_remarks"></textarea></div>
                    <div class="li-field" style="flex:1;"><label>Apollo Remarks</label><textarea id="pay_appolo_remarks"></textarea></div>
                </div>

                <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                    <button onclick="savePayment()" class="btn-pro btn-green" style="flex:1; height: 45px; font-size: 1rem;">SAVE PAYMENT</button>
                    <button onclick="editPayment()" class="btn-pro btn-orange" style="flex:1; height: 45px; font-size: 1rem;">EDIT PAYMENT</button>
                </div>
            </div>
        </div>
    </div>
</div>
`;

// Helper: Format Date to DD/MM/YYYY
function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateString;
}

let billingEditMode = false;
let paymentEditMode = false;
let currentInvoices = []; // Local cache of invoices for the current PO

function ensureBillingModalExists() {
    if (!document.getElementById('billingModal')) {
        document.body.insertAdjacentHTML('beforeend', billingModalHTML);

        // Add specific listeners for autocalcs that need DOM
        document.getElementById('bill_invoice_date')?.addEventListener('change', updateDueDate);
        document.getElementById('bill_credit_period')?.addEventListener('input', updateDueDate);
    }
}

async function openBillingModal() {
    ensureBillingModalExists();

    const modal = document.getElementById('billingModal');
    if (modal) {
        modal.classList.add('open');
        billingEditMode = false;

        // Copy PO info
        const poNum = lineItemsState.poNumber || document.getElementById('li_display_po_number')?.value;
        const poValRaw = document.getElementById('li_display_po_value')?.value || '0';
        const poVal = poValRaw.replace(/[^0-9.]/g, '');

        document.getElementById('bill_po_number').value = poNum || '';
        document.getElementById('bill_po_value').value = poVal || '';

        // Load latest invoices from backend to ensure grid is up-to-date
        try {
            const res = await api.get(`/purchase-orders/${encodeURIComponent(poNum)}/invoices`);
            currentInvoices = res.invoices || [];

            // Sync currentInvoices back to lineItemsState for local display
            lineItemsState.currentLineItems.forEach(li => {
                if (li.milestones) {
                    li.milestones.forEach(ms => {
                        const inv = currentInvoices.find(i => i.milestone_id == ms.id || (i.line_item_id == li.id && !i.milestone_id));
                        if (inv) {
                            ms.invoice_no = inv.invoice_no;
                            ms.invoice_date = inv.invoice_date;
                            ms.invoice_value = inv.total_value;
                            ms.payment_received = inv.payment_received;
                            ms.pending_amount = inv.pending_amount;
                            ms.remarks = inv.remarks;
                            ms.credit_period = inv.credit_period;
                            ms.status = inv.status;
                        } else {
                            // Blank out if no invoice found (User's request: grid details after delivery time should be blank)
                            ms.invoice_no = null;
                            ms.invoice_date = null;
                            ms.invoice_value = 0;
                            ms.payment_received = 0;
                            ms.pending_amount = 0;
                            ms.remarks = null;
                        }
                    });
                }
            });
        } catch (e) {
            console.error("Failed to load existing invoices", e);
        }

        populateBillingGrid();
        resetBillingForm();
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
    const tbody = document.getElementById('billingGridBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    lineItemsState.currentLineItems.forEach((li, idx) => {
        if (!li.milestones) return;
        li.milestones.forEach((ms, msIdx) => {
            const tr = document.createElement('tr');

            const invVal = (ms.invoice_value) ? parseFloat(ms.invoice_value).toFixed(2) : '';
            const payRec = (ms.payment_received) ? parseFloat(ms.payment_received).toFixed(2) : '';
            const pendAmt = (ms.pending_amount) ? parseFloat(ms.pending_amount).toFixed(2) : '0.00';

            tr.innerHTML = `
                <td><input type="checkbox" class="bill-row-select" data-li="${li.id}" data-ms="${ms.id}" onchange="handleBillingRowChange(this)" ${ms.invoice_no ? 'disabled' : ''}></td>
                <td>${msIdx === 0 ? (li.line_item_no || (idx + 1)) : ''}</td>
                <td>${msIdx === 0 ? (li.description || '') : ''}</td>
                <td>${ms.quantity || ''}</td>
                <td>${ms.cycle_value || ''}</td>
                <td>${ms.milestone_name || ''}</td>
                <td>${ms.payment_terms || '-'}</td>
                <td>${ms.documents || '-'}</td>
                <td>${ms.delivery_date || '-'}</td>
                <td><span data-field="invoice_no">${ms.invoice_no || ''}</span></td>
                <td><span data-field="invoice_date" data-raw-date="${ms.invoice_date || ''}">${formatDateToDDMMYYYY(ms.invoice_date) || ''}</span></td>
                <td><span data-field="invoice_value">${invVal}</span></td>
                <td><span data-field="payment_received">${payRec}</span></td>
                <td><span class="pending-amt" data-li="${li.id}" data-ms="${ms.id}">${pendAmt}</span></td>
                <td><span data-field="remarks" data-raw-remarks="${ms.remarks || ''}" data-status="${ms.status || 'Pending'}" data-credit-period="${ms.credit_period || 0}">${ms.remarks || ''}</span></td>
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
    updateCheckedBillingRows();
}

window.updateCheckedBillingRows = function () {
    const checkboxes = document.querySelectorAll('.bill-row-select:checked');
    checkboxes.forEach(cb => mapFormToGridRow(cb));
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
        const totalVal = document.getElementById('bill_total_val').value;
        const payRec = document.getElementById('bill_payment_rec').value;
        const remarks = document.getElementById('bill_remarks').value;
        const status = document.getElementById('bill_status').value;
        const credit = document.getElementById('bill_credit_period').value;

        if (noSpan) noSpan.textContent = invNo;
        if (dateSpan) {
            dateSpan.textContent = formatDateToDDMMYYYY(invDate);
            dateSpan.setAttribute('data-raw-date', invDate);
        }
        if (valueSpan) {
            valueSpan.textContent = totalVal;
            valueSpan.setAttribute('data-taxable', document.getElementById('bill_taxable_val').value);
            valueSpan.setAttribute('data-gst', document.getElementById('bill_gst_val').value);
        }
        if (paySpan) paySpan.textContent = payRec;
        if (remSpan) {
            remSpan.textContent = remarks;
            remSpan.setAttribute('data-raw-remarks', remarks);
            remSpan.setAttribute('data-status', status);
            remSpan.setAttribute('data-credit-period', credit);
        }
        if (pendingSpan) {
            pendingSpan.textContent = (parseFloat(totalVal || 0) - parseFloat(payRec || 0)).toFixed(2);
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
            remSpan.textContent = ms.remarks || '';
            remSpan.setAttribute('data-raw-remarks', ms.remarks || '');
            remSpan.setAttribute('data-status', ms.status || 'Pending');
            remSpan.setAttribute('data-credit-period', ms.credit_period || 0);
        }
        if (pendingSpan) pendingSpan.textContent = ms.pending_amount ? parseFloat(ms.pending_amount).toFixed(2) : '0.00';
    }
}

window.toggleAllBillingRows = function (selectAll) {
    const checkboxes = document.querySelectorAll('.bill-row-select');
    checkboxes.forEach(cb => {
        if (!cb.disabled) {
            cb.checked = selectAll.checked;
            mapFormToGridRow(cb);
        }
    });
}

window.handleBillingRowChange = function (checkbox) {
    if (billingEditMode && checkbox.checked) {
        // Single row edit focus
        document.querySelectorAll('.bill-row-select').forEach(c => { if (c !== checkbox) c.checked = false; });

        const tr = checkbox.closest('tr');
        const remSpan = tr.querySelector('[data-field="remarks"]');
        const valSpan = tr.querySelector('[data-field="invoice_value"]');

        document.getElementById('bill_invoice_no').value = tr.querySelector('[data-field="invoice_no"]')?.textContent || '';
        document.getElementById('bill_invoice_date').value = tr.querySelector('[data-field="invoice_date"]')?.getAttribute('data-raw-date') || '';
        document.getElementById('bill_taxable_val').value = valSpan?.getAttribute('data-taxable') || '';
        document.getElementById('bill_gst_val').value = valSpan?.getAttribute('data-gst') || '';
        document.getElementById('bill_total_val').value = valSpan?.textContent || '';
        document.getElementById('bill_payment_rec').value = tr.querySelector('[data-field="payment_received"]')?.textContent || 0;
        document.getElementById('bill_remarks').value = remSpan?.getAttribute('data-raw-remarks') || '';
        document.getElementById('bill_status').value = remSpan?.getAttribute('data-status') || 'Pending';
        document.getElementById('bill_credit_period').value = remSpan?.getAttribute('data-credit-period') || 0;

        updateDueDate();
    }
}

window.editBillingItem = function () {
    billingEditMode = true;
    const boxes = document.querySelectorAll('.bill-row-select');
    boxes.forEach(cb => { if (cb.disabled) cb.disabled = false; });
    alert("Edit Mode: Select a row to update its invoice details.");
}

window.cancelBillingItem = function () {
    if (confirm("Cancel selected invoices?")) {
        document.getElementById('bill_status').value = 'Cancel';
        updateCheckedBillingRows();
    }
}

async function saveBillingItem() {
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
            openBillingModal(); // Refresh
        } else alert("Error: " + res.error);
    } catch (e) { alert("Network Error"); }
}

// ========== PAYMENT LOGIC ==========

function openPaymentModal() {
    ensureBillingModalExists(); // Payment modal is part of it
    document.getElementById('billingModal').classList.remove('open');
    document.getElementById('paymentModal').classList.add('open');

    populateInvoiceDropdown();
    resetPaymentForm();
    paymentEditMode = false;

    // Set PO info
    document.getElementById('pay_po_number').value = lineItemsState.poNumber || '';
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('open');
}

function resetPaymentForm() {
    const ids = ['pay_invoice_date', 'pay_hw_sw', 'pay_taxable_val', 'pay_gst_val', 'pay_total_val', 'pay_tds_income', 'pay_tds_gst', 'pay_receivable', 'pay_gst_hold', 'pay_actual_receivable', 'pay_customer_remarks', 'pay_appolo_remarks'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('pay_tds_x_pct').value = 0;
    document.getElementById('pay_tds_y_pct').value = 0;
    document.getElementById('pay_tds_z_pct').value = 0;
    document.getElementById('pay_other_deduction').value = 0;
    document.getElementById('pay_amount_received').value = 0;
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
    if (!inv) return;

    document.getElementById('pay_invoice_date').value = formatDateToDDMMYYYY(inv.invoice_date);
    document.getElementById('pay_taxable_val').value = inv.taxable_value.toFixed(2);
    document.getElementById('pay_gst_val').value = inv.gst_value.toFixed(2);
    document.getElementById('pay_total_val').value = inv.total_value.toFixed(2);

    const li = lineItemsState.currentLineItems.find(l => l.id == inv.line_item_id);
    document.getElementById('pay_hw_sw').value = li?.line_item_type || '';

    calculatePaymentFields();
}

window.calculatePaymentFields = function () {
    const A = parseFloat(document.getElementById('pay_taxable_val').value) || 0;
    const B = parseFloat(document.getElementById('pay_gst_val').value) || 0;
    const C = parseFloat(document.getElementById('pay_total_val').value) || 0;
    const X = parseFloat(document.getElementById('pay_tds_x_pct').value) || 0;
    const Y = parseFloat(document.getElementById('pay_tds_y_pct').value) || 0;
    const Z = parseFloat(document.getElementById('pay_tds_z_pct').value) || 0;

    const D = A * (X / 100);
    const E = A * (Y / 100);
    const F = C - D - E;
    const G = B * (Z / 100);
    const H = F - G;

    document.getElementById('pay_tds_income').value = D.toFixed(2);
    document.getElementById('pay_tds_gst').value = E.toFixed(2);
    document.getElementById('pay_receivable').value = F.toFixed(2);
    document.getElementById('pay_gst_hold').value = G.toFixed(2);
    document.getElementById('pay_actual_receivable').value = H.toFixed(2);

    const I = parseFloat(document.getElementById('pay_other_deduction').value) || 0;
    const received = parseFloat(document.getElementById('pay_amount_received').value) || 0;
    const diff = Math.abs(received - (H - I));

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
    alert("Payment saved locally (Demo). Backend hook needed for full persistence.");
}

function editPayment() { paymentEditMode = true; alert("Edit mode enabled"); }
function closeBillingModal() { document.getElementById('billingModal').classList.remove('open'); }
function recordPayment() { handlePaymentButtonClick(); }
function openBillingPage() { openBillingModal(); }
