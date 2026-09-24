(function () {
  'use strict';

  /* ================================================================
     CONSTANTS & STATE
     ================================================================ */
  const STORAGE_KEY = 'expenseTracker';
  let data = null;
  let editingId = null;
  let editingCatId = null;
  let pieChartInstance = null;
  let lineChartInstance = null;
  let pendingImportData = null;
  let dom = {};

  /* ================================================================
     HELPERS
     ================================================================ */
  function $(id) { return document.getElementById(id); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function formatCurrency(n) {
    return '\u20B9' + Number(n).toFixed(2);
  }

  function formatDateShort(str) {
    var d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function todayStr() { return new Date().toISOString().split('T')[0]; }

  function weekStartStr() {
    var d = new Date(), day = d.getDay(), diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d.toISOString().split('T')[0];
  }

  function monthStartStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }

  function yearStartStr() { return new Date().getFullYear() + '-01-01'; }

  function daysAgoStr(n) {
    var d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }

  function isWeekend(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
  }

  function sumArr(arr) { return arr.reduce(function (s, e) { return s + e.amount; }, 0); }

  function getCat(id) {
    return data.categories.find(function (c) { return c.id === id; }) || null;
  }

  function ADD_NEW_CAT() { return '__add_new__'; }

  /* ================================================================
     NAME → COLOR GENERATOR
     ================================================================ */
  function nameToColor(name) {
    if (!name || !name.trim()) return '#6366f1';
    var str = name.trim().toLowerCase();
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    hash = Math.abs(hash);
    var hue = hash % 360;
    var sat = 55 + (hash % 26);
    var light = 42 + ((hash >> 8) % 11);
    return 'hsl(' + hue + ', ' + sat + '%, ' + light + '%)';
  }

  function colorToHex(color) {
    var tmp = document.createElement('div');
    tmp.style.color = color;
    document.body.appendChild(tmp);
    var computed = getComputedStyle(tmp).color;
    document.body.removeChild(tmp);
    var match = computed.match(/(\d+)/g);
    if (!match || match.length < 3) return '#6366f1';
    return '#' + ((1 << 24) + (parseInt(match[0]) << 16) + (parseInt(match[1]) << 8) + parseInt(match[2])).toString(16).slice(1);
  }

  function showToast(msg, type) {
    type = type || 'success';
    var toast = document.querySelector('.toast');
    if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.className = 'toast toast-' + type;
    requestAnimationFrame(function () { toast.classList.add('toast-visible'); });
    clearTimeout(toast._tid);
    toast._tid = setTimeout(function () { toast.classList.remove('toast-visible'); }, 2800);
  }

  /* ================================================================
     DATA MANAGEMENT
     ================================================================ */
  function loadData() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        data = JSON.parse(raw);
        if (!Array.isArray(data.expenses)) data.expenses = [];
        if (!Array.isArray(data.categories)) data.categories = [];
        if (!data.settings) data.settings = { theme: 'light' };
        data.categories.forEach(function (c) {
          if (!Array.isArray(c.subcategories)) c.subcategories = [];
          if (c.color && (c.color.indexOf('hsl') !== -1 || c.color.indexOf('rgb') !== -1)) {
            c.color = colorToHex(c.color);
          }
        });
      } catch (e) { data = null; }
    }
    if (!data) {
      data = {
        expenses: [],
        categories: [
          { id: uid(), name: 'Food & Dining', color: colorToHex(nameToColor('Food & Dining')), subcategories: ['Groceries', 'Restaurants', 'Snacks'] },
          { id: uid(), name: 'Transport', color: colorToHex(nameToColor('Transport')), subcategories: ['Auto-Rickshaw', 'Bus', 'Metro', 'Fuel'] },
          { id: uid(), name: 'Shopping', color: colorToHex(nameToColor('Shopping')), subcategories: ['Clothes', 'Electronics'] },
          { id: uid(), name: 'Bills & Utilities', color: colorToHex(nameToColor('Bills & Utilities')), subcategories: ['Electricity', 'Water', 'Internet', 'Mobile Recharge'] },
          { id: uid(), name: 'Entertainment', color: colorToHex(nameToColor('Entertainment')), subcategories: ['Movies', 'Subscriptions', 'Games'] },
          { id: uid(), name: 'Health', color: colorToHex(nameToColor('Health')), subcategories: ['Medicines', 'Doctor Visit', 'Gym'] }
        ],
        settings: { theme: 'light' }
      };
      saveData();
    }
  }

  function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

  /* ================================================================
     CATEGORY MANAGEMENT
     ================================================================ */
  function addCategory(name, color) {
    var trimmed = name.trim();
    if (!trimmed) { showToast('Category name cannot be empty', 'error'); return false; }

    var exists = data.categories.some(function (c) {
      return c.id !== editingCatId && c.name.toLowerCase() === trimmed.toLowerCase();
    });
    if (exists) { showToast('Category already exists', 'error'); return false; }

    if (editingCatId) {
      var cat = getCat(editingCatId);
      if (cat) {
        cat.name = trimmed;
        cat.color = color;
        saveData();
        showToast('Category "' + trimmed + '" updated!', 'success');
      }
      cancelCategoryEdit();
    } else {
      data.categories.push({ id: uid(), name: trimmed, color: color, subcategories: [] });
      saveData();
      showToast('Category "' + trimmed + '" added!', 'success');
    }

    dom.categoryNameInput.value = '';
    dom.categoryColorPicker.value = colorToHex(nameToColor(''));
    refreshAll();
    return true;
  }

  function deleteCategory(id) {
    var cat = getCat(id);
    var name = cat ? cat.name : 'Category';
    data.categories = data.categories.filter(function (c) { return c.id !== id; });
    var removedCount = data.expenses.filter(function (e) { return e.categoryId === id; }).length;
    data.expenses = data.expenses.filter(function (e) { return e.categoryId !== id; });
    if (editingCatId === id) cancelCategoryEdit();
    saveData();
    refreshAll();
    showToast(name + ' removed' + (removedCount > 0 ? ' along with ' + removedCount + ' expense(s)' : ''), 'success');
  }

  function startCategoryEdit(id) {
    var cat = getCat(id);
    if (!cat) return;
    if (editingCatId && editingCatId !== id) cancelCategoryEdit();

    editingCatId = id;
    dom.categoryNameInput.value = cat.name;
    dom.categoryColorPicker.value = cat.color;
    dom.addCategoryBtn.textContent = 'Save Changes';
    dom.addCategoryBtn.classList.remove('btn-secondary');
    dom.addCategoryBtn.classList.add('btn-primary');

    if (!dom.cancelCatEditBtn) {
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', cancelCategoryEdit);
      dom.addCategoryBtn.parentNode.insertBefore(cancelBtn, dom.addCategoryBtn.nextSibling);
      dom.cancelCatEditBtn = cancelBtn;
    }

    highlightEditingCategory(id);
    dom.categoryNameInput.focus();
    dom.categoryNameInput.select();
  }

  function cancelCategoryEdit() {
    editingCatId = null;
    dom.categoryNameInput.value = '';
    dom.categoryColorPicker.value = colorToHex(nameToColor(''));
    dom.addCategoryBtn.textContent = 'Add Category';
    dom.addCategoryBtn.classList.remove('btn-primary');
    dom.addCategoryBtn.classList.add('btn-secondary');
    if (dom.cancelCatEditBtn) { dom.cancelCatEditBtn.remove(); dom.cancelCatEditBtn = null; }
    clearEditingHighlight();
  }

  function highlightEditingCategory(id) {
    dom.categoryList.querySelectorAll('.category-item').forEach(function (li) {
      li.classList.toggle('category-editing', li.dataset.catId === id);
    });
  }

  function clearEditingHighlight() {
    dom.categoryList.querySelectorAll('.category-item').forEach(function (li) {
      li.classList.remove('category-editing');
    });
  }

  function handleCategoryNameInput() {
    if (editingCatId) return;
    var name = dom.categoryNameInput.value;
    dom.categoryColorPicker.value = colorToHex(nameToColor(name));
  }

  /* ================================================================
     SUBCATEGORY MANAGEMENT
     ================================================================ */
  function addSubcategory(categoryId, subName) {
    var trimmed = subName.trim();
    if (!trimmed) { showToast('Subcategory name cannot be empty', 'error'); return false; }
    var cat = getCat(categoryId);
    if (!cat) { showToast('Category not found', 'error'); return false; }
    var exists = cat.subcategories.some(function (s) { return s.toLowerCase() === trimmed.toLowerCase(); });
    if (exists) { showToast('Subcategory already exists in "' + cat.name + '"', 'error'); return false; }
    cat.subcategories.push(trimmed);
    saveData();
    renderCategories();
    renderSubcategoryManager();
    updateSubcategoryDatalist(dom.expenseCategory.value);
    showToast('Subcategory added to "' + cat.name + '"', 'success');
    return true;
  }

  function deleteSubcategory(categoryId, subName) {
    var cat = getCat(categoryId);
    if (!cat) return;
    cat.subcategories = cat.subcategories.filter(function (s) { return s.toLowerCase() !== subName.toLowerCase(); });
    data.expenses.forEach(function (e) {
      if (e.categoryId === categoryId && e.subcategory && e.subcategory.toLowerCase() === subName.toLowerCase()) {
        e.subcategory = '';
      }
    });
    saveData();
    renderCategories();
    renderSubcategoryManager();
    updateSubcategoryDatalist(dom.expenseCategory.value);
    renderExpenses();
    showToast('Subcategory removed', 'success');
  }

  function saveSubcategoryFromExpense(categoryId, subName) {
    var trimmed = subName.trim();
    if (!trimmed) return;
    var cat = getCat(categoryId);
    if (!cat) return;
    var exists = cat.subcategories.some(function (s) { return s.toLowerCase() === trimmed.toLowerCase(); });
    if (!exists) { cat.subcategories.push(trimmed); saveData(); }
  }

  function updateSubcategoryDatalist(categoryId) {
    var datalist = dom.subcategoryDatalist;
    datalist.innerHTML = '';
    if (!categoryId || categoryId === ADD_NEW_CAT()) return;
    var cat = getCat(categoryId);
    if (!cat || cat.subcategories.length === 0) return;
    cat.subcategories.forEach(function (sub) {
      var opt = document.createElement('option');
      opt.value = sub;
      datalist.appendChild(opt);
    });
  }

  function buildSubcategoryManager() {
    var section = $('categorySection');
    var wrapper = document.createElement('div');
    wrapper.id = 'subcategoryManager';
    wrapper.style.cssText = 'margin-top:24px;padding-top:20px;border-top:1px solid var(--border);';

    var title = document.createElement('h3');
    title.style.cssText = 'font-size:0.95rem;font-weight:650;color:var(--text-primary);margin-bottom:14px;';
    title.textContent = 'Manage Subcategories';
    wrapper.appendChild(title);

    var formRow = document.createElement('div');
    formRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;';

    var catGroup = document.createElement('div');
    catGroup.className = 'form-group';
    var catLabel = document.createElement('label');
    catLabel.setAttribute('for', 'subCatCategorySelect');
    catLabel.textContent = 'Select Category';
    var catSelect = document.createElement('select');
    catSelect.id = 'subCatCategorySelect';
    catSelect.className = 'form-input';
    catGroup.appendChild(catLabel);
    catGroup.appendChild(catSelect);

    var subGroup = document.createElement('div');
    subGroup.className = 'form-group';
    var subLabel = document.createElement('label');
    subLabel.setAttribute('for', 'subCatNameInput');
    subLabel.textContent = 'Subcategory Name';
    var subInput = document.createElement('input');
    subInput.type = 'text';
    subInput.id = 'subCatNameInput';
    subInput.className = 'form-input';
    subInput.placeholder = 'e.g. Groceries, Metro';
    subGroup.appendChild(subLabel);
    subGroup.appendChild(subInput);

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.id = 'addSubCatBtn';
    addBtn.className = 'btn btn-secondary';
    addBtn.textContent = '+ Add';
    addBtn.style.height = '42px';

    formRow.appendChild(catGroup);
    formRow.appendChild(subGroup);
    formRow.appendChild(addBtn);
    wrapper.appendChild(formRow);

    var listContainer = document.createElement('div');
    listContainer.id = 'subCatListContainer';
    listContainer.style.cssText = 'margin-top:16px;';
    wrapper.appendChild(listContainer);

    section.appendChild(wrapper);

    dom.subCatCategorySelect = catSelect;
    dom.subCatNameInput = subInput;
    dom.addSubCatBtn = addBtn;
    dom.subCatListContainer = listContainer;
  }

  function renderSubcategoryManager() {
    var sel = dom.subCatCategorySelect;
    var curVal = sel.value;
    sel.innerHTML = '<option value="" disabled selected>Choose category</option>';
    data.categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name + ' (' + cat.subcategories.length + ' subs)';
      sel.appendChild(opt);
    });
    if (curVal && data.categories.some(function (c) { return c.id === curVal; })) sel.value = curVal;
    renderSubcategoryList();
  }

  function renderSubcategoryList() {
    var container = dom.subCatListContainer;
    container.innerHTML = '';
    var catId = dom.subCatCategorySelect.value;
    if (!catId) {
      var hint = document.createElement('p');
      hint.style.cssText = 'color:var(--text-muted);font-size:0.85rem;text-align:center;padding:16px 0;';
      hint.textContent = 'Select a category above to view and manage its subcategories.';
      container.appendChild(hint);
      return;
    }
    var cat = getCat(catId);
    if (!cat) return;
    if (cat.subcategories.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color:var(--text-muted);font-size:0.85rem;text-align:center;padding:16px 0;';
      empty.textContent = 'No subcategories for "' + cat.name + '" yet. Add one above or type in the expense form to auto-save.';
      container.appendChild(empty);
      return;
    }
    var tagWrap = document.createElement('div');
    tagWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    cat.subcategories.forEach(function (sub) {
      var tag = document.createElement('span');
      tag.style.cssText =
        'display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;' +
        'font-size:0.82rem;font-weight:500;background-color:' + cat.color + '18;color:' + cat.color + ';' +
        'border:1px solid ' + cat.color + '30;animation:badgeIn 0.3s ease forwards;';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = sub;
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.style.cssText =
        'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;' +
        'border-radius:50%;border:none;background-color:' + cat.color + '30;color:' + cat.color + ';' +
        'font-size:13px;line-height:1;cursor:pointer;padding:0;transition:background-color 0.2s ease;';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Remove "' + sub + '"';
      delBtn.addEventListener('mouseenter', function () { delBtn.style.backgroundColor = cat.color; delBtn.style.color = '#ffffff'; });
      delBtn.addEventListener('mouseleave', function () { delBtn.style.backgroundColor = cat.color + '30'; delBtn.style.color = cat.color; });
      delBtn.addEventListener('click', function () { deleteSubcategory(catId, sub); });
      tag.appendChild(nameSpan);
      tag.appendChild(delBtn);
      tagWrap.appendChild(tag);
    });
    container.appendChild(tagWrap);
  }

  function renderCategories() {
    var list = dom.categoryList;
    list.innerHTML = '';
    data.categories.forEach(function (cat) {
      var li = document.createElement('li');
      li.className = 'category-item';
      li.dataset.catId = cat.id;
      li.style.backgroundColor = cat.color;
      if (editingCatId === cat.id) li.classList.add('category-editing');

      var nameSpan = document.createElement('span');
      nameSpan.textContent = cat.name;
      if (cat.subcategories.length > 0) {
        var subCount = document.createElement('span');
        subCount.style.cssText = 'font-size:0.72rem;opacity:0.75;margin-left:2px';
        subCount.textContent = '(' + cat.subcategories.length + ')';
        nameSpan.appendChild(subCount);
      }

      var editBtn = document.createElement('button');
      editBtn.className = 'category-remove';
      editBtn.type = 'button';
      editBtn.innerHTML = '&#9998;';
      editBtn.title = 'Edit "' + cat.name + '"';
      editBtn.setAttribute('aria-label', 'Edit ' + cat.name);
      editBtn.style.fontSize = '11px';
      editBtn.addEventListener('click', function (e) { e.stopPropagation(); startCategoryEdit(cat.id); });

      var removeBtn = document.createElement('button');
      removeBtn.className = 'category-remove';
      removeBtn.type = 'button';
      removeBtn.innerHTML = '&times;';
      removeBtn.setAttribute('aria-label', 'Remove ' + cat.name);
      removeBtn.addEventListener('click', function (e) { e.stopPropagation(); deleteCategory(cat.id); });

      li.appendChild(nameSpan);
      li.appendChild(editBtn);
      li.appendChild(removeBtn);
      list.appendChild(li);
    });
  }

  function updateCategoryDropdowns() {
    var sel = dom.expenseCategory;
    var curVal = sel.value;
    sel.innerHTML = '<option value="" disabled selected>Select category</option>';
    data.categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      sel.appendChild(opt);
    });
    var addOpt = document.createElement('option');
    addOpt.value = ADD_NEW_CAT();
    addOpt.textContent = '\u2795 Add new category...';
    sel.appendChild(addOpt);
    if (curVal && (data.categories.some(function (c) { return c.id === curVal; }) || curVal === ADD_NEW_CAT())) {
      sel.value = curVal;
    } else {
      sel.value = '';
    }

    var filterSel = dom.filterCategory;
    var filterVal = filterSel.value;
    filterSel.innerHTML = '<option value="all">All Categories</option>';
    data.categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      filterSel.appendChild(opt);
    });
    if (filterVal === 'all' || data.categories.some(function (c) { return c.id === filterVal; })) {
      filterSel.value = filterVal;
    } else {
      filterSel.value = 'all';
    }

    if (dom.subCatCategorySelect) renderSubcategoryManager();
  }

  /* ================================================================
     EXPENSE NOTE BOX MANAGEMENT
     ================================================================ */
  function expandNoteBox() {
    dom.noteContainer.classList.remove('collapsed');
    dom.toggleNoteBtn.setAttribute('aria-expanded', 'true');
    var txt = dom.toggleNoteBtn.querySelector('.note-btn-text');
    if (txt) txt.textContent = 'Remove Note';
  }

  function collapseNoteBox() {
    dom.noteContainer.classList.add('collapsed');
    dom.toggleNoteBtn.setAttribute('aria-expanded', 'false');
    var txt = dom.toggleNoteBtn.querySelector('.note-btn-text');
    if (txt) txt.textContent = 'Add Note';
    dom.expenseNote.value = '';
    updateNoteCharCounter();
  }

  function toggleNoteBox() {
    if (dom.noteContainer.classList.contains('collapsed')) {
      expandNoteBox();
      dom.expenseNote.focus();
    } else {
      collapseNoteBox();
    }
  }

  function updateNoteCharCounter() {
    var count = dom.expenseNote.value.length;
    dom.noteCharCounter.textContent = count + '/500';
  }

  /* ================================================================
     EXPENSE MANAGEMENT (CRUD)
     ================================================================ */
  function addExpense(amount, categoryId, subcategory, date, comment) {
    saveSubcategoryFromExpense(categoryId, subcategory);
    var expObj = {
      id: uid(),
      amount: parseFloat(amount),
      categoryId: categoryId,
      subcategory: subcategory.trim(),
      date: date,
      createdAt: new Date().toISOString()
    };
    if (comment && comment.trim()) {
      expObj.comment = comment.trim();
    }
    data.expenses.push(expObj);
    saveData();
  }

  function updateExpense(id, amount, categoryId, subcategory, date, comment) {
    saveSubcategoryFromExpense(categoryId, subcategory);
    var idx = data.expenses.findIndex(function (e) { return e.id === id; });
    if (idx !== -1) {
      data.expenses[idx].amount = parseFloat(amount);
      data.expenses[idx].categoryId = categoryId;
      data.expenses[idx].subcategory = subcategory.trim();
      data.expenses[idx].date = date;
      if (comment && comment.trim()) {
        data.expenses[idx].comment = comment.trim();
      } else {
        delete data.expenses[idx].comment;
      }
      saveData();
    }
  }

  function deleteExpense(id) {
    data.expenses = data.expenses.filter(function (e) { return e.id !== id; });
    saveData();
    refreshAll();
    showToast('Expense deleted', 'success');
  }

  function deleteExpenseNote(id) {
    var exp = data.expenses.find(function (e) { return e.id === id; });
    if (exp && exp.comment) {
      delete exp.comment;
      saveData();
      refreshAll();
      showToast('Note removed', 'success');
    }
  }

  function startEdit(id) {
    var exp = data.expenses.find(function (e) { return e.id === id; });
    if (!exp) return;
    editingId = id;
    dom.expenseAmount.value = exp.amount;
    dom.expenseCategory.value = exp.categoryId;
    dom.expenseSubcategory.value = exp.subcategory;
    dom.expenseDate.value = exp.date;

    if (exp.comment) {
      dom.expenseNote.value = exp.comment;
      updateNoteCharCounter();
      expandNoteBox();
    } else {
      collapseNoteBox();
    }

    dom.addExpenseBtn.textContent = 'Update Expense';
    updateSubcategoryDatalist(exp.categoryId);

    if (!dom.cancelEditBtn) {
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', cancelEdit);
      dom.addExpenseBtn.parentNode.insertBefore(cancelBtn, dom.addExpenseBtn.nextSibling);
      dom.cancelEditBtn = cancelBtn;
    }
    dom.expenseFormSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dom.expenseAmount.focus();
  }

  function cancelEdit() {
    editingId = null;
    dom.expenseForm.reset();
    dom.expenseDate.value = todayStr();
    collapseNoteBox();
    dom.addExpenseBtn.textContent = 'Add Expense';
    clearInputErrors();
    if (dom.cancelEditBtn) { dom.cancelEditBtn.remove(); dom.cancelEditBtn = null; }
    dom.subcategoryDatalist.innerHTML = '';
  }

  function clearInputErrors() {
    dom.expenseAmount.classList.remove('input-error');
    dom.expenseCategory.classList.remove('input-error');
    dom.expenseDate.classList.remove('input-error');
  }

  async function handleExpenseSubmit(e) {
    e.preventDefault();

    var amount = dom.expenseAmount.value;
    var categoryId = dom.expenseCategory.value;
    var subcategory = dom.expenseSubcategory.value;
    var date = dom.expenseDate.value;
    var comment = dom.noteContainer.classList.contains('collapsed') ? '' : dom.expenseNote.value;

    clearInputErrors();
    var valid = true;
    if (!amount || parseFloat(amount) <= 0) { dom.expenseAmount.classList.add('input-error'); valid = false; }
    if (!categoryId || categoryId === ADD_NEW_CAT()) { dom.expenseCategory.classList.add('input-error'); valid = false; }
    if (!date) { dom.expenseDate.classList.add('input-error'); valid = false; }
    if (!valid) { showToast('Please fill in all required fields', 'error'); return; }

    if (editingId) {
      updateExpense(editingId, amount, categoryId, subcategory, date, comment);
      showToast('Expense updated', 'success');
      cancelEdit();
    } else {
      addExpense(amount, categoryId, subcategory, date, comment);
      showToast('Expense added', 'success');
      dom.expenseForm.reset();
      dom.expenseDate.value = todayStr();
      collapseNoteBox();
    }
    refreshAll();
  }

  function handleCategoryChange() {
    var val = dom.expenseCategory.value;
    if (val === ADD_NEW_CAT()) {
      dom.categorySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { dom.categoryNameInput.focus(); showToast('Enter your new category below', 'info'); }, 400);
      dom.expenseCategory.value = '';
      dom.subcategoryDatalist.innerHTML = '';
      return;
    }
    updateSubcategoryDatalist(val);
  }

  /* ================================================================
     EXPENSE RENDERING (TABLE & CARDS)
     ================================================================ */
  function renderExpenses() {
    var filterVal = dom.filterCategory.value;
    var filtered = data.expenses.slice();
    if (filterVal !== 'all') filtered = filtered.filter(function (e) { return e.categoryId === filterVal; });
    filtered.sort(function (a, b) {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    var isEmpty = filtered.length === 0;
    dom.emptyState.classList.toggle('hidden', !isEmpty);

    if (window.innerWidth >= 768) {
      dom.expenseTableWrapper.style.display = isEmpty ? 'none' : '';
      dom.expenseCards.style.display = 'none';
    } else {
      dom.expenseTableWrapper.style.display = 'none';
      dom.expenseCards.style.display = isEmpty ? 'none' : '';
    }
    renderTable(filtered);
    renderCards(filtered);
  }

  function createNoteElement(commentText, expId) {
    var noteDiv = document.createElement('div');
    noteDiv.className = 'table-note-line';

    var noteIcon = document.createElement('span');
    noteIcon.className = 'note-icon';
    noteIcon.textContent = '📝';

    var noteText = document.createElement('span');
    noteText.className = 'note-text' + (commentText.length > 60 ? ' clamped' : '');
    noteText.textContent = commentText;

    noteDiv.appendChild(noteIcon);
    noteDiv.appendChild(noteText);

    if (commentText.length > 60) {
      var toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn-inline-text';
      toggleBtn.type = 'button';
      toggleBtn.textContent = 'show more';
      toggleBtn.addEventListener('click', function () {
        var isClamped = noteText.classList.toggle('clamped');
        toggleBtn.textContent = isClamped ? 'show more' : 'show less';
      });
      noteDiv.appendChild(toggleBtn);
    }

    var delNoteBtn = document.createElement('button');
    delNoteBtn.className = 'btn-delete-note';
    delNoteBtn.type = 'button';
    delNoteBtn.textContent = 'Delete note';
    delNoteBtn.title = 'Delete note only';
    delNoteBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteExpenseNote(expId);
    });
    noteDiv.appendChild(delNoteBtn);

    return noteDiv;
  }

  function renderTable(list) {
    var tbody = dom.expenseTableBody;
    tbody.innerHTML = '';
    list.forEach(function (exp) {
      var cat = getCat(exp.categoryId);
      var tr = document.createElement('tr');

      var tdDate = document.createElement('td');
      tdDate.textContent = formatDateShort(exp.date);

      var tdCat = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'table-category-badge';
      badge.style.backgroundColor = cat ? cat.color : '#6b7280';
      badge.textContent = cat ? cat.name : 'Unknown';
      tdCat.appendChild(badge);

      var tdSub = document.createElement('td');
      tdSub.textContent = exp.subcategory || '\u2014';

      if (exp.comment) {
        tdSub.appendChild(createNoteElement(exp.comment, exp.id));
      }

      var tdAmt = document.createElement('td');
      tdAmt.className = 'table-amount';
      tdAmt.textContent = formatCurrency(exp.amount);

      var tdActions = document.createElement('td');
      tdActions.appendChild(createEditBtn(exp.id));
      tdActions.appendChild(createDeleteBtn(exp.id));

      tr.appendChild(tdDate);
      tr.appendChild(tdCat);
      tr.appendChild(tdSub);
      tr.appendChild(tdAmt);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  function renderCards(list) {
    var container = dom.expenseCards;
    container.innerHTML = '';
    list.forEach(function (exp) {
      var cat = getCat(exp.categoryId);
      var card = document.createElement('div');
      card.className = 'expense-card';

      var header = document.createElement('div');
      header.className = 'expense-card-header';
      var dateSpan = document.createElement('span');
      dateSpan.className = 'expense-card-date';
      dateSpan.textContent = formatDateShort(exp.date);
      var amtSpan = document.createElement('span');
      amtSpan.className = 'expense-card-amount';
      amtSpan.textContent = formatCurrency(exp.amount);
      header.appendChild(dateSpan);
      header.appendChild(amtSpan);

      var details = document.createElement('div');
      details.className = 'expense-card-details';
      var badge = document.createElement('span');
      badge.className = 'table-category-badge';
      badge.style.backgroundColor = cat ? cat.color : '#6b7280';
      badge.textContent = cat ? cat.name : 'Unknown';
      details.appendChild(badge);
      if (exp.subcategory) {
        var subSpan = document.createElement('span');
        subSpan.style.cssText = 'color:var(--text-secondary);font-size:0.84rem';
        subSpan.textContent = exp.subcategory;
        details.appendChild(subSpan);
      }

      card.appendChild(header);
      card.appendChild(details);

      if (exp.comment) {
        card.appendChild(createNoteElement(exp.comment, exp.id));
      }

      var actions = document.createElement('div');
      actions.className = 'expense-card-actions';
      actions.appendChild(createEditBtn(exp.id));
      actions.appendChild(createDeleteBtn(exp.id));
      card.appendChild(actions);

      container.appendChild(card);
    });
  }

  function createEditBtn(id) {
    var btn = document.createElement('button');
    btn.className = 'btn-danger-sm';
    btn.type = 'button';
    btn.textContent = 'Edit';
    btn.addEventListener('click', function () { startEdit(id); });
    return btn;
  }

  function createDeleteBtn(id) {
    var btn = document.createElement('button');
    btn.className = 'btn-danger-sm';
    btn.type = 'button';
    btn.textContent = 'Delete';
    btn.style.marginLeft = '6px';
    btn.addEventListener('click', function () { deleteExpense(id); });
    return btn;
  }

  /* ================================================================
     DASHBOARD & ANALYTICS
     ================================================================ */
  function calculateTotals() {
    var today = todayStr(), wStart = weekStartStr(), mStart = monthStartStr(), yStart = yearStartStr();
    var daily = 0, weekly = 0, monthly = 0, yearly = 0;
    data.expenses.forEach(function (e) {
      var a = e.amount;
      if (e.date === today) daily += a;
      if (e.date >= wStart) weekly += a;
      if (e.date >= mStart) monthly += a;
      if (e.date >= yStart) yearly += a;
    });
    return { daily: daily, weekly: weekly, monthly: monthly, yearly: yearly };
  }

  function updateDashboard() {
    var t = calculateTotals();
    dom.amountDaily.textContent = formatCurrency(t.daily);
    dom.amountWeekly.textContent = formatCurrency(t.weekly);
    dom.amountMonthly.textContent = formatCurrency(t.monthly);
    dom.amountYearly.textContent = formatCurrency(t.yearly);
  }

  function findTopCategory() {
    if (data.expenses.length === 0) return null;
    var map = {};
    data.expenses.forEach(function (e) { map[e.categoryId] = (map[e.categoryId] || 0) + e.amount; });
    var topId = null, topAmt = 0;
    Object.keys(map).forEach(function (id) { if (map[id] > topAmt) { topAmt = map[id]; topId = id; } });
    return topId ? { category: getCat(topId), amount: topAmt } : null;
  }

  function findHighestSpendingDay() {
    if (data.expenses.length === 0) return null;
    var map = {};
    data.expenses.forEach(function (e) { map[e.date] = (map[e.date] || 0) + e.amount; });
    var topDate = null, topAmt = 0;
    Object.keys(map).forEach(function (d) { if (map[d] > topAmt) { topAmt = map[d]; topDate = d; } });
    return topDate ? { date: topDate, amount: topAmt } : null;
  }

  /* ================================================================
     INSIGHTS ENGINE
     ================================================================ */
  function compareWeeklySpending() {
    var d = new Date(), day = d.getDay(), diff = day === 0 ? 6 : day - 1;
    var thisMon = new Date(); thisMon.setDate(d.getDate() - diff);
    var lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
    var thisStr = thisMon.toISOString().split('T')[0], lastStr = lastMon.toISOString().split('T')[0];
    var thisWeek = sumArr(data.expenses.filter(function (e) { return e.date >= thisStr; }));
    var lastWeek = sumArr(data.expenses.filter(function (e) { return e.date >= lastStr && e.date < thisStr; }));
    return { thisWeek: thisWeek, lastWeek: lastWeek, change: lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : 0 };
  }

  function detectFrequentSmallExpenses() {
    return data.expenses.filter(function (e) { return e.date >= daysAgoStr(30) && e.amount <= 10; }).length;
  }

  function detectTimePatterns() {
    var p = { morning: { count: 0, total: 0 }, afternoon: { count: 0, total: 0 }, evening: { count: 0, total: 0 }, night: { count: 0, total: 0 } };
    data.expenses.forEach(function (e) {
      if (!e.createdAt) return;
      var h = new Date(e.createdAt).getHours(), k;
      if (h >= 5 && h < 12) k = 'morning'; else if (h >= 12 && h < 17) k = 'afternoon'; else if (h >= 17 && h < 22) k = 'evening'; else k = 'night';
      p[k].count++; p[k].total += e.amount;
    });
    return { sorted: Object.keys(p).map(function (k) { return { name: k, count: p[k].count }; }).sort(function (a, b) { return b.count - a.count; }) };
  }

  function detectWeekendVsWeekday() {
    var recent = data.expenses.filter(function (e) { return e.date >= daysAgoStr(30); });
    var wE = { t: 0, c: 0 }, wD = { t: 0, c: 0 };
    recent.forEach(function (e) { if (isWeekend(e.date)) { wE.t += e.amount; wE.c++; } else { wD.t += e.amount; wD.c++; } });
    return { weekendTotal: wE.t, weekendCount: wE.c, weekdayTotal: wD.t, weekdayCount: wD.c };
  }

  function generateInsights() {
    var container = dom.insightsContainer;
    container.innerHTML = '';
    var msgs = [];
    if (data.expenses.length === 0) { msgs.push({ type: 'info', text: 'Add some expenses to see personalized insights.' }); }
    else {
      var totalAll = sumArr(data.expenses);
      var topCat = findTopCategory();
      if (topCat && topCat.category) {
        var pct = totalAll > 0 ? ((topCat.amount / totalAll) * 100).toFixed(1) : 0;
        msgs.push({ type: pct > 50 ? 'warning' : 'info', text: 'Top category: "' + topCat.category.name + '" at ' + formatCurrency(topCat.amount) + ' (' + pct + '%).' });
      }
      var weekly = compareWeeklySpending();
      if (weekly.lastWeek > 0) {
        if (weekly.change > 20) msgs.push({ type: 'danger', text: 'Spending is ' + weekly.change.toFixed(0) + '% higher than last week!' });
        else if (weekly.change < -20) msgs.push({ type: 'success', text: 'Spending is ' + Math.abs(weekly.change).toFixed(0) + '% lower than last week!' });
        else msgs.push({ type: 'info', text: 'Weekly spending stable (' + (weekly.change > 0 ? '+' : '') + weekly.change.toFixed(0) + '%).' });
      }
      var highDay = findHighestSpendingDay();
      if (highDay) msgs.push({ type: 'info', text: 'Highest spending day: ' + formatDateShort(highDay.date) + ' (' + formatCurrency(highDay.amount) + ').' });
      var smallCount = detectFrequentSmallExpenses();
      if (smallCount >= 10) msgs.push({ type: 'warning', text: smallCount + ' small purchases (under \u20B910) this month — watch out!' });
      var tp = detectTimePatterns();
      var totalTx = tp.sorted.reduce(function (s, p) { return s + p.count; }, 0);
      if (totalTx >= 5 && tp.sorted[0].count > 0) msgs.push({ type: 'info', text: 'Most active spending time: ' + tp.sorted[0].name + ' (' + ((tp.sorted[0].count / totalTx) * 100).toFixed(0) + '%).' });
      var wwd = detectWeekendVsWeekday();
      if (wwd.weekendCount > 0 && wwd.weekdayCount > 0) {
        var avgWE = wwd.weekendTotal / wwd.weekendCount, avgWD = wwd.weekdayTotal / wwd.weekdayCount;
        if (avgWE > avgWD * 1.3) msgs.push({ type: 'warning', text: 'Weekend avg (' + formatCurrency(avgWE) + ') much higher than weekday (' + formatCurrency(avgWD) + ').' });
        else if (avgWD > avgWE * 1.3) msgs.push({ type: 'info', text: 'Weekday avg (' + formatCurrency(avgWD) + ') higher than weekend (' + formatCurrency(avgWE) + ').' });
      }
      var subMap = {};
      data.expenses.forEach(function (e) { if (e.subcategory) subMap[e.subcategory] = (subMap[e.subcategory] || 0) + 1; });
      var topSubs = Object.keys(subMap).sort(function (a, b) { return subMap[b] - subMap[a]; }).slice(0, 3);
      if (topSubs.length > 0 && subMap[topSubs[0]] >= 3) msgs.push({ type: 'info', text: 'Top subcategories: ' + topSubs.join(', ') + '.' });
      var totalSubs = data.categories.reduce(function (s, c) { return s + c.subcategories.length; }, 0);
      if (totalSubs > 0) msgs.push({ type: 'success', text: totalSubs + ' saved subcategories across ' + data.categories.length + ' categories for quick selection.' });
    }
    msgs.forEach(function (msg) {
      var div = document.createElement('div');
      div.className = 'insight-message insight-' + msg.type;
      div.textContent = msg.text;
      container.appendChild(div);
    });
  }

  /* ================================================================
     CHARTS
     ================================================================ */
  function getChartTextColor() { return getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#8b90a5'; }
  function getChartBgColor() { return getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#ffffff'; }

  function renderPieChart() {
    if (typeof Chart === 'undefined') return;
    var catTotals = {};
    data.expenses.forEach(function (e) { catTotals[e.categoryId] = (catTotals[e.categoryId] || 0) + e.amount; });
    var labels = [], values = [], colors = [];
    Object.keys(catTotals).forEach(function (id) {
      var cat = getCat(id);
      labels.push(cat ? cat.name : 'Unknown');
      values.push(catTotals[id]);
      colors.push(cat ? cat.color : '#6b7280');
    });
    if (pieChartInstance) pieChartInstance.destroy();
    pieChartInstance = new Chart(dom.pieChartCanvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: getChartBgColor(), hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12 }, color: getChartTextColor() } },
          tooltip: { callbacks: { label: function (ctx) { return ' ' + ctx.label + ': ' + formatCurrency(ctx.parsed); } } }
        }
      }
    });
  }

  function renderLineChart() {
    if (typeof Chart === 'undefined') return;
    var labels = [], values = [];
    for (var i = 29; i >= 0; i--) {
      var dateStr = daysAgoStr(i);
      labels.push(new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      values.push(data.expenses.filter(function (e) { return e.date === dateStr; }).reduce(function (s, e) { return s + e.amount; }, 0));
    }
    if (lineChartInstance) lineChartInstance.destroy();
    var isDark = document.documentElement.classList.contains('dark');
    lineChartInstance = new Chart(dom.lineChartCanvas.getContext('2d'), {
      type: 'line',
      data: { labels: labels, datasets: [{ label: 'Daily Spending', data: values, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 6, pointHoverBackgroundColor: '#6366f1', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: true, interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return ' ' + formatCurrency(ctx.parsed.y); } } } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8, color: isDark ? '#9ca0b8' : '#8b90a5', font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }, ticks: { color: isDark ? '#9ca0b8' : '#8b90a5', font: { size: 11 }, callback: function (v) { return '\u20B9' + v; } } }
        }
      }
    });
  }

  /* ================================================================
     HEATMAP & TOOLTIP
     ================================================================ */
  function renderHeatmap() {
    var grid = dom.heatmapGrid;
    grid.innerHTML = '';
    var totalDays = 35, dailyTotals = {}, maxAmount = 0;
    for (var i = totalDays - 1; i >= 0; i--) {
      var ds = daysAgoStr(i);
      var total = data.expenses.filter(function (e) { return e.date === ds; }).reduce(function (s, e) { return s + e.amount; }, 0);
      dailyTotals[ds] = total;
      if (total > maxAmount) maxAmount = total;
    }

    var tooltip = $('heatmapTooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'heatmapTooltip';
      tooltip.className = 'heatmap-tooltip';
      document.body.appendChild(tooltip);
    }

    for (var j = totalDays - 1; j >= 0; j--) {
      var dateStr = daysAgoStr(j), amt = dailyTotals[dateStr];
      var cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.dataset.tooltip = formatDateShort(dateStr) + ': ' + formatCurrency(amt);

      if (maxAmount > 0 && amt > 0) {
        var r = amt / maxAmount;
        cell.classList.add(r >= 0.75 ? 'level-4' : r >= 0.5 ? 'level-3' : r >= 0.25 ? 'level-2' : 'level-1');
      }

      cell.addEventListener('mouseenter', function (e) {
        tooltip.textContent = this.dataset.tooltip;
        tooltip.classList.add('visible');
        var rect = this.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
        tooltip.style.top = (rect.top - tooltip.offsetHeight - 6) + 'px';
      });

      cell.addEventListener('mouseleave', function () {
        tooltip.classList.remove('visible');
      });

      grid.appendChild(cell);
    }
  }

  /* ================================================================
     DARK MODE
     ================================================================ */
  function toggleTheme() {
    var isDark = document.documentElement.classList.toggle('dark');
    data.settings.theme = isDark ? 'dark' : 'light';
    saveData();
    applyTheme(data.settings.theme);
    renderPieChart();
    renderLineChart();
  }

  function applyTheme(theme) {
    if (theme === 'dark') { document.documentElement.classList.add('dark'); dom.toggleIcon.textContent = '\u2600'; }
    else { document.documentElement.classList.remove('dark'); dom.toggleIcon.textContent = '\u263D'; }
  }

  /* ================================================================
     EXPORT PDF
     ================================================================ */
  function generatePDF() {
    try {
      if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
        showToast('PDF library not loaded — refresh the page.', 'error');
        return;
      }

      var doc = new window.jspdf.jsPDF();
      var pw = doc.internal.pageSize.getWidth();
      var ph = doc.internal.pageSize.getHeight();
      var mg = 14;
      var cw = pw - mg * 2;
      var pdfCur = function(n) { return 'Rs. ' + Number(n).toFixed(2); };

      function hexRgb(hex) {
        hex = (hex || '#6b7280').replace('#', '');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        return [parseInt(hex.substring(0,2),16), parseInt(hex.substring(2,4),16), parseInt(hex.substring(4,6),16)];
      }

      var now = new Date();
      var mStart = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-01';
      var monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      var monthFile = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toLowerCase().replace(/\s+/g, '-');
      var monthlyExp = data.expenses.filter(function(e){ return e.date >= mStart; });
      monthlyExp.sort(function(a,b){ return b.date.localeCompare(a.date); });
      var totalMonth = monthlyExp.reduce(function(s,e){ return s + e.amount; }, 0);

      var daysElapsed = now.getDate();
      var avgDaily = daysElapsed > 0 ? totalMonth / daysElapsed : 0;

      function drawFooter() {
        var pn = doc.internal.getNumberOfPages();
        for (var p = 1; p <= pn; p++) {
          doc.setPage(p);
          doc.setFillColor(99, 102, 241);
          doc.rect(0, ph - 7, pw, 7, 'F');
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(255);
          doc.text('Expense Tracker  |  Monthly Report', mg, ph - 2.5);
          doc.text('Page ' + p + ' of ' + pn, pw - mg, ph - 2.5, { align: 'right' });
        }
      }

      doc.setFillColor(99, 102, 241);
      doc.rect(0, 0, pw, 5, 'F');
      doc.setFillColor(245, 158, 11);
      doc.rect(0, 5, pw, 1, 'F');

      var y = 18;
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 60);
      doc.text('Monthly Expense Report', mg, y);

      y += 8;
      doc.setFillColor(99, 102, 241);
      doc.roundedRect(mg, y - 4, 42, 7, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255);
      doc.text(monthLabel, mg + 5, y);

      y += 6;
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(140);
      doc.text('Generated: ' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        + '  |  Total entries: ' + monthlyExp.length, mg, y);

      y += 5;
      doc.setDrawColor(230);
      doc.setLineWidth(0.4);
      doc.line(mg, y, pw - mg, y);

      y += 6;
      var cardH = 26;
      var cardGap = 5;
      var cardW = (cw - cardGap * 3) / 4;
      var t = calculateTotals();

      var cards = [
        { label: 'TODAY', value: pdfCur(t.daily), accent: [16, 185, 129] },
        { label: 'THIS WEEK', value: pdfCur(t.weekly), accent: [99, 102, 241] },
        { label: 'THIS MONTH', value: pdfCur(t.monthly), accent: [245, 158, 11] },
        { label: 'AVG / DAY', value: pdfCur(avgDaily), accent: [239, 68, 68] }
      ];

      cards.forEach(function(card, i) {
        var cx = mg + i * (cardW + cardGap);
        doc.setFillColor(235, 237, 243);
        doc.roundedRect(cx + 0.5, y + 0.5, cardW, cardH, 3, 3, 'F');
        doc.setFillColor(250, 251, 254);
        doc.roundedRect(cx, y, cardW, cardH, 3, 3, 'F');
        doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
        doc.rect(cx, y, cardW, 2.5, 'F');
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
        doc.text(card.label, cx + 6, y + 11);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 60);
        doc.text(card.value, cx + 6, y + 21);
      });

      var catTotals = {};
      monthlyExp.forEach(function(e){ catTotals[e.categoryId] = (catTotals[e.categoryId] || 0) + e.amount; });

      var catEntries = Object.keys(catTotals).map(function(id){
        var cat = getCat(id);
        return { name: cat ? cat.name : 'Unknown', color: cat ? cat.color : '#6b7280', amount: catTotals[id] };
      }).sort(function(a,b){ return b.amount - a.amount; });

      y += cardH + 12;
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 60);
      doc.text('Category Breakdown', mg, y);

      y += 3;
      doc.setDrawColor(230);
      doc.setLineWidth(0.3);
      doc.line(mg, y, pw - mg, y);
      y += 7;

      var barMaxW = cw * 0.42;
      var barH = 6;

      catEntries.forEach(function(entry) {
        if (y > 258) {
          doc.addPage();
          y = 18;
          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 30, 60);
          doc.text('Category Breakdown (continued)', mg, y);
          y += 3;
          doc.setDrawColor(230);
          doc.line(mg, y, pw - mg, y);
          y += 7;
        }

        var pct = totalMonth > 0 ? (entry.amount / totalMonth) * 100 : 0;
        var barW = totalMonth > 0 ? (entry.amount / totalMonth) * barMaxW : 0;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(50, 50, 70);
        doc.text(entry.name, mg, y);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140);
        doc.text(pct.toFixed(1) + '%', mg + 52, y);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(50, 50, 70);
        doc.text(pdfCur(entry.amount), pw - mg, y, { align: 'right' });

        y += 3;
        doc.setFillColor(235, 237, 245);
        doc.roundedRect(mg, y, barMaxW, barH, 2, 2, 'F');

        if (barW > 1) {
          var rgb = hexRgb(entry.color);
          doc.setFillColor(rgb[0], rgb[1], rgb[2]);
          doc.roundedRect(mg, y, Math.max(5, barW), barH, 2, 2, 'F');
        }

        y += barH + 9;
      });

      if (catEntries.length > 0) {
        doc.setDrawColor(180);
        doc.setLineWidth(0.5);
        doc.line(mg, y - 5, pw - mg, y - 5);
        doc.setLineWidth(0.2);
        doc.line(mg, y - 3.5, pw - mg, y - 3.5);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 60);
        doc.text('Grand Total', mg, y + 3);
        doc.text(pdfCur(totalMonth), pw - mg, y + 3, { align: 'right' });
        y += 14;
      }

      if (monthlyExp.length > 0) {
        if (y > 215) { doc.addPage(); y = 18; }

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 60);
        doc.text('Transaction Details', mg, y);

        y += 3;
        doc.setDrawColor(230);
        doc.setLineWidth(0.3);
        doc.line(mg, y, pw - mg, y);
        y += 6;

        var colDate = mg;
        var colCat = mg + 30;
        var colSub = mg + 82;
        var colAmtR = pw - mg;
        var rowH = 7.5;

        function drawTableHeader(ty) {
          doc.setFillColor(30, 30, 60);
          doc.roundedRect(mg, ty, cw, rowH, 2, 2, 'F');
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255);
          doc.text('DATE', colDate + 3, ty + 5);
          doc.text('CATEGORY', colCat + 3, ty + 5);
          doc.text('SUBCATEGORY', colSub + 3, ty + 5);
          doc.text('AMOUNT', colAmtR - 3, ty + 5, { align: 'right' });
          return ty + rowH;
        }

        y = drawTableHeader(y);

        function drawRow(exp, idx, ry) {
          var cat = getCat(exp.categoryId);
          var rgb = cat && cat.color ? hexRgb(cat.color) : [107, 114, 128];
          var hasNote = !!exp.comment;
          var curRowH = hasNote ? rowH + 4.5 : rowH;

          if (idx % 2 === 0) {
            doc.setFillColor(248, 249, 253);
            doc.rect(mg, ry, cw, curRowH, 'F');
          }

          doc.setFillColor(rgb[0], rgb[1], rgb[2]);
          doc.circle(colCat + 2, ry + 4, 1.8, 'F');

          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100);
          doc.text(formatDateShort(exp.date), colDate + 3, ry + 5);

          doc.setTextColor(50);
          doc.setFont('helvetica', 'bold');
          doc.text(cat ? cat.name : 'Unknown', colCat + 6, ry + 5);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(150);
          doc.text(exp.subcategory || '\u2014', colSub + 3, ry + 5);

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(50);
          doc.text(pdfCur(exp.amount), colAmtR - 3, ry + 5, { align: 'right' });

          if (hasNote) {
            doc.setFontSize(7);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(130);
            doc.text('Note: ' + exp.comment, colCat + 6, ry + 9.5);
          }

          return ry + curRowH;
        }

        monthlyExp.forEach(function(exp, idx) {
          var neededH = exp.comment ? rowH + 4.5 : rowH;
          if (y + neededH > ph - 18) {
            doc.addPage();
            y = 18;
            y = drawTableHeader(y);
          }
          y = drawRow(exp, idx, y);
        });

        doc.setDrawColor(200);
        doc.setLineWidth(0.3);
        doc.line(mg, y, pw - mg, y);
        y += 3;

        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(160);
        doc.text(monthlyExp.length + ' transaction' + (monthlyExp.length !== 1 ? 's' : '') + ' in ' + monthLabel, mg, y);
      } else {
        y += 10;
        doc.setDrawColor(200);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([3, 3], 0);
        doc.roundedRect(mg + 20, y - 5, cw - 40, 30, 4, 4, 'S');
        doc.setLineDashPattern([], 0);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(160);
        doc.text('No expenses recorded for ' + monthLabel, pw / 2, y + 6, { align: 'center' });
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.text('Start adding expenses to see them here in your monthly report.', pw / 2, y + 15, { align: 'center' });
      }

      drawFooter();
      doc.save('expense-report-' + monthFile + '.pdf');
      showToast('PDF exported for ' + monthLabel, 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Failed to generate PDF: ' + err.message, 'error');
    }
  }

  /* ================================================================
     EXPORT JSON & IMPORT (JSON / CSV)
     ================================================================ */
  function exportJSON() {
    var backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      expenses: data.expenses,
      categories: data.categories,
      settings: data.settings
    };
    var str = JSON.stringify(backup, null, 2);
    var blob = new Blob([str], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'expense-tracker-backup-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup exported as JSON', 'success');
  }

  function handleImportClick() {
    dom.importFileInput.click();
  }

  function handleImportFileSelect(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (evt) {
      var content = evt.target.result;
      var parsed = parseImportContent(file.name, content);

      if (!parsed || (parsed.expenses.length === 0 && parsed.skippedCount === 0)) {
        showToast('Invalid or empty file format', 'error');
        dom.importFileInput.value = '';
        return;
      }

      if (parsed.expenses.length === 0) {
        showToast('No valid expenses found. ' + parsed.skippedCount + ' row(s) skipped.', 'error');
        dom.importFileInput.value = '';
        return;
      }

      pendingImportData = parsed;
      var count = parsed.expenses.length;
      var skipText = parsed.skippedCount > 0 ? ' (' + parsed.skippedCount + ' bad row' + (parsed.skippedCount > 1 ? 's' : '') + ' skipped)' : '';
      dom.importSummaryText.textContent = 'Found ' + count + ' valid expense' + (count === 1 ? '' : 's') + ' in file' + skipText + '. How would you like to proceed?';
      openImportModal();
      dom.importFileInput.value = '';
    };
    reader.onerror = function () {
      showToast('Error reading file', 'error');
      dom.importFileInput.value = '';
    };
    reader.readAsText(file);
  }

  function parseImportContent(filename, text) {
    var ext = filename.split('.').pop().toLowerCase();
    var skippedCount = 0;
    var parsedExpenses = [];
    var parsedCategories = [];

    text = text.trim();
    if (!text) return null;

    if (ext === 'json' || text.startsWith('{') || text.startsWith('[')) {
      try {
        var json = JSON.parse(text);
        var rawExpenses = [];
        if (Array.isArray(json)) {
          rawExpenses = json;
        } else if (typeof json === 'object' && json !== null) {
          if (Array.isArray(json.expenses)) rawExpenses = json.expenses;
          if (Array.isArray(json.categories)) parsedCategories = json.categories;
        } else {
          return null;
        }

        rawExpenses.forEach(function (item) {
          var date = item.date || item.Date;
          var amount = parseFloat(item.amount !== undefined ? item.amount : item.Amount);
          var catName = item.category || item.Category || item.categoryName || '';
          var catId = item.categoryId || '';
          var subcat = item.subcategory || item.Subcategory || '';
          var comment = item.comment || item.Comment || item.note || item.Note || '';

          if (!date || isNaN(Date.parse(date)) || isNaN(amount) || amount <= 0) {
            skippedCount++;
            return;
          }

          var formattedDate = new Date(date).toISOString().split('T')[0];

          parsedExpenses.push({
            id: item.id || uid(),
            amount: amount,
            categoryId: catId,
            categoryName: typeof catName === 'string' ? catName.trim() : '',
            subcategory: typeof subcat === 'string' ? subcat.trim() : '',
            date: formattedDate,
            comment: typeof comment === 'string' ? comment.trim() : '',
            createdAt: item.createdAt || new Date().toISOString()
          });
        });
      } catch (err) {
        return null;
      }
    } else {
      var lines = text.split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
      if (lines.length < 2) return null;

      var headers = parseCSVLine(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
      var idxDate = headers.findIndex(function (h) { return h === 'date'; });
      var idxCat = headers.findIndex(function (h) { return h === 'category'; });
      var idxSub = headers.findIndex(function (h) { return h === 'subcategory'; });
      var idxAmt = headers.findIndex(function (h) { return h === 'amount'; });
      var idxComment = headers.findIndex(function (h) { return h === 'comment' || h === 'note'; });

      if (idxDate === -1 || idxAmt === -1) return null;

      for (var i = 1; i < lines.length; i++) {
        var row = parseCSVLine(lines[i]);
        if (row.length === 0) continue;

        var rawDate = row[idxDate];
        var rawAmt = row[idxAmt];
        var rawCat = idxCat !== -1 ? row[idxCat] : 'General';
        var rawSub = idxSub !== -1 ? row[idxSub] : '';
        var rawComment = idxComment !== -1 ? row[idxComment] : '';

        var amount = parseFloat(rawAmt);
        if (!rawDate || isNaN(Date.parse(rawDate)) || isNaN(amount) || amount <= 0) {
          skippedCount++;
          continue;
        }

        var formattedDate = new Date(rawDate).toISOString().split('T')[0];

        parsedExpenses.push({
          id: uid(),
          amount: amount,
          categoryName: (rawCat || 'General').trim(),
          subcategory: (rawSub || '').trim(),
          date: formattedDate,
          comment: (rawComment || '').trim(),
          createdAt: new Date().toISOString()
        });
      }
    }

    return {
      expenses: parsedExpenses,
      categories: parsedCategories,
      skippedCount: skippedCount
    };
  }

  function parseCSVLine(line) {
    var result = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += c;
      }
    }
    result.push(current);
    return result.map(function(s) { return s.replace(/^"|"$/g, '').trim(); });
  }

  function openImportModal() {
    dom.importModal.classList.remove('hidden');
  }

  function closeImportModal() {
    dom.importModal.classList.add('hidden');
    pendingImportData = null;
  }

  function executeImport(mode) {
    if (!pendingImportData) return;

    var importedExp = pendingImportData.expenses;
    var importedCats = pendingImportData.categories || [];
    var skippedCount = pendingImportData.skippedCount || 0;

    if (mode === 'replace') {
      data.expenses = [];
      if (importedCats.length > 0) {
        data.categories = [];
        importedCats.forEach(function (cat) {
          if (cat.name) {
            data.categories.push({
              id: cat.id || uid(),
              name: cat.name.trim(),
              color: cat.color ? colorToHex(cat.color) : colorToHex(nameToColor(cat.name)),
              subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : []
            });
          }
        });
      }
    }

    function resolveCatId(catId, catName) {
      if (catId) {
        var existingById = getCat(catId);
        if (existingById) return existingById.id;
      }
      var nameToMatch = catName || 'Uncategorized';
      var existingByName = data.categories.find(function (c) {
        return c.name.toLowerCase() === nameToMatch.toLowerCase();
      });
      if (existingByName) return existingByName.id;

      var newCat = {
        id: uid(),
        name: nameToMatch,
        color: colorToHex(nameToColor(nameToMatch)),
        subcategories: []
      };
      data.categories.push(newCat);
      return newCat.id;
    }

    var addedCount = 0;

    importedExp.forEach(function (exp) {
      var finalCatId = resolveCatId(exp.categoryId, exp.categoryName);

      if (mode === 'merge') {
        var isDuplicate = data.expenses.some(function (existing) {
          if (existing.id && exp.id && existing.id === exp.id) return true;
          return existing.date === exp.date &&
                 Math.abs(existing.amount - exp.amount) < 0.001 &&
                 existing.categoryId === finalCatId &&
                 (existing.subcategory || '').toLowerCase() === (exp.subcategory || '').toLowerCase() &&
                 (existing.comment || '').toLowerCase() === (exp.comment || '').toLowerCase();
        });
        if (isDuplicate) return;
      }

      saveSubcategoryFromExpense(finalCatId, exp.subcategory);

      var newExp = {
        id: uid(),
        amount: exp.amount,
        categoryId: finalCatId,
        subcategory: exp.subcategory || '',
        date: exp.date,
        createdAt: exp.createdAt || new Date().toISOString()
      };
      if (exp.comment) newExp.comment = exp.comment;

      data.expenses.push(newExp);
      addedCount++;
    });

    saveData();
    refreshAll();
    closeImportModal();
    showToast(addedCount + ' imported' + (skippedCount > 0 ? ', ' + skippedCount + ' skipped' : ''), 'success');
  }

  /* ================================================================
     NAVIGATION & SCROLL-SPY
     ================================================================ */
  function initNavigation() {
    var header = dom.appHeader;
    var nav = dom.headerNav;
    if (!nav) return;
    var links = nav.querySelectorAll('.nav-link');
    var hamburger = dom.hamburgerToggle;

    if (hamburger) {
      hamburger.addEventListener('click', function () {
        var isOpen = header.classList.toggle('nav-open');
        hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    }

    links.forEach(function (link) {
      link.addEventListener('click', function (e) {
        var targetId = link.getAttribute('data-target') || link.getAttribute('href').replace('#', '');
        var section = document.getElementById(targetId);
        if (section) {
          e.preventDefault();
          header.classList.remove('nav-open');
          if (hamburger) hamburger.setAttribute('aria-expanded', 'false');

          section.scrollIntoView({ behavior: 'smooth', block: 'start' });

          links.forEach(function (l) { l.classList.remove('active'); });
          link.classList.add('active');
        }
      });
    });

    var sections = Array.from(links).map(function (l) {
      var id = l.getAttribute('data-target') || l.getAttribute('href').replace('#', '');
      return document.getElementById(id);
    }).filter(Boolean);

    function onScroll() {
      var scrollPos = window.scrollY + 100;
      var currentSection = null;

      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        if (sec.offsetTop <= scrollPos) {
          currentSection = sec;
        }
      }

      if (currentSection) {
        var activeId = currentSection.id;
        links.forEach(function (l) {
          var targetId = l.getAttribute('data-target') || l.getAttribute('href').replace('#', '');
          l.classList.toggle('active', targetId === activeId);
        });
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ================================================================
     REFRESH ALL
     ================================================================ */
  function refreshAll() {
    renderCategories();
    updateCategoryDropdowns();
    renderExpenses();
    updateDashboard();
    renderPieChart();
    renderLineChart();
    renderHeatmap();
    generateInsights();
  }

  /* ================================================================
     RESPONSIVE
     ================================================================ */
  var resizeTimer;
  function debouncedResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderExpenses, 200); }

  /* ================================================================
     EVENT BINDING
     ================================================================ */
  function bindEvents() {
    dom.darkModeToggle.addEventListener('click', toggleTheme);
    dom.expenseForm.addEventListener('submit', handleExpenseSubmit);

    [dom.expenseAmount, dom.expenseCategory, dom.expenseDate, dom.expenseNote].forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () { el.classList.remove('input-error'); });
      el.addEventListener('change', function () { el.classList.remove('input-error'); });
    });

    dom.expenseCategory.addEventListener('change', handleCategoryChange);

    dom.toggleNoteBtn.addEventListener('click', toggleNoteBox);
    dom.removeNoteBtn.addEventListener('click', collapseNoteBox);
    dom.expenseNote.addEventListener('input', updateNoteCharCounter);

    dom.categoryNameInput.addEventListener('input', handleCategoryNameInput);

    dom.addCategoryBtn.addEventListener('click', function () {
      var name = dom.categoryNameInput.value;
      var color = dom.categoryColorPicker.value;
      if (addCategory(name, color)) {
        if (!editingCatId) {
          dom.categoryNameInput.value = '';
          dom.categoryColorPicker.value = colorToHex(nameToColor(''));
        }
      }
    });

    dom.categoryNameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); dom.addCategoryBtn.click(); }
    });

    dom.subCatCategorySelect.addEventListener('change', renderSubcategoryList);
    dom.addSubCatBtn.addEventListener('click', function () {
      var catId = dom.subCatCategorySelect.value;
      var subName = dom.subCatNameInput.value;
      if (!catId) { showToast('Select a category first', 'error'); dom.subCatCategorySelect.focus(); return; }
      if (addSubcategory(catId, subName)) { dom.subCatNameInput.value = ''; dom.subCatNameInput.focus(); }
    });
    dom.subCatNameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); dom.addSubCatBtn.click(); } });

    dom.filterCategory.addEventListener('change', renderExpenses);
    dom.exportPdfBtn.addEventListener('click', generatePDF);
    dom.exportJsonBtn.addEventListener('click', exportJSON);
    dom.importBtn.addEventListener('click', handleImportClick);
    dom.importFileInput.addEventListener('change', handleImportFileSelect);

    dom.closeImportModalBtn.addEventListener('click', closeImportModal);
    dom.importMergeBtn.addEventListener('click', function () { executeImport('merge'); });
    dom.importReplaceBtn.addEventListener('click', function () { executeImport('replace'); });
    dom.importModal.addEventListener('click', function (e) {
      if (e.target === dom.importModal) closeImportModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !dom.importModal.classList.contains('hidden')) {
        closeImportModal();
      }
    });

    window.addEventListener('resize', debouncedResize);

    initNavigation();
  }

  /* ================================================================
     INITIALIZATION
     ================================================================ */
  async function init() {
    dom = {
      darkModeToggle: $('darkModeToggle'), toggleIcon: $('toggleIcon'),
      hamburgerToggle: $('hamburgerToggle'), appHeader: $('appHeader'), headerNav: $('headerNav'),
      expenseForm: $('expenseForm'), expenseFormSection: $('expenseFormSection'),
      expenseAmount: $('expenseAmount'), expenseCategory: $('expenseCategory'),
      expenseSubcategory: $('expenseSubcategory'), expenseDate: $('expenseDate'),
      toggleNoteBtn: $('toggleNoteBtn'), removeNoteBtn: $('removeNoteBtn'),
      noteContainer: $('noteContainer'), expenseNote: $('expenseNote'), noteCharCounter: $('noteCharCounter'),
      addExpenseBtn: $('addExpenseBtn'),
      categoryNameInput: $('categoryNameInput'), categoryColorPicker: $('categoryColorPicker'),
      addCategoryBtn: $('addCategoryBtn'), categoryList: $('categoryList'),
      categorySection: $('categorySection'),
      amountDaily: $('amountDaily'), amountWeekly: $('amountWeekly'),
      amountMonthly: $('amountMonthly'), amountYearly: $('amountYearly'),
      pieChartCanvas: $('pieChart'), lineChartCanvas: $('lineChart'),
      insightsContainer: $('insightsContainer'), heatmapGrid: $('heatmapGrid'),
      expenseTableBody: $('expenseTableBody'), expenseTableWrapper: $('expenseTableWrapper'),
      expenseCards: $('expenseCards'), emptyState: $('emptyState'),
      filterCategory: $('filterCategory'), exportPdfBtn: $('exportPdfBtn'),
      exportJsonBtn: $('exportJsonBtn'), importBtn: $('importBtn'), importFileInput: $('importFileInput'),
      importModal: $('importModal'), closeImportModalBtn: $('closeImportModalBtn'),
      importSummaryText: $('importSummaryText'), importMergeBtn: $('importMergeBtn'),
      importReplaceBtn: $('importReplaceBtn'),
      cancelEditBtn: null, cancelCatEditBtn: null,
      subcategoryDatalist: null, subCatCategorySelect: null,
      subCatNameInput: null, addSubCatBtn: null, subCatListContainer: null
    };

    var datalist = document.createElement('datalist');
    datalist.id = 'subcategorySuggestions';
    document.body.appendChild(datalist);
    dom.subcategoryDatalist = datalist;
    dom.expenseSubcategory.setAttribute('list', 'subcategorySuggestions');

    buildSubcategoryManager();

    dom.categoryColorPicker.value = colorToHex(nameToColor(''));

    await loadData();
    dom.expenseDate.value = todayStr();
    applyTheme(data.settings.theme);

    refreshAll();
    bindEvents();

    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      dom.exportPdfBtn.disabled = true;
      dom.exportPdfBtn.title = 'PDF library could not be loaded. Check your internet connection and refresh.';
    }
  }

  window.addEventListener('DOMContentLoaded', init);

})();