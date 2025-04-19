// DOM Elements
const backBtn = document.getElementById('backBtn');
const addCallTypeBtn = document.getElementById('addCallTypeBtn');
const callTypesList = document.getElementById('callTypesList');
const callTypeModal = document.getElementById('callTypeModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const callTypeForm = document.getElementById('callTypeForm');
const callTypeId = document.getElementById('callTypeId');
const callTypeName = document.getElementById('callTypeName');
const modalTitle = document.getElementById('modalTitle');

// Rich text editor instance
let quill;

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  initializeRichTextEditor();
  loadCallTypes();
  setupEventListeners();

});

// Initialize Quill rich text editor
function initializeRichTextEditor() {
  quill = new Quill('#descriptionEditor', {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['link'],
        ['clean']
      ]
    },
    placeholder: 'Enter call type description, guidelines, or agenda...'
  });
}

// Set up event listeners
function setupEventListeners() {
  // Navigation
  backBtn.addEventListener('click', () => {
    window.electronAPI.navigateToMain();
  });

  // Modal controls
  addCallTypeBtn.addEventListener('click', openAddCallTypeModal);
  closeModalBtn.addEventListener('click', closeModal);
  callTypeForm.addEventListener('submit', handleCallTypeSubmit);
}

// Load call types from main process
async function loadCallTypes() {
  try {
    const callTypes = await window.electronAPI.getCallTypes();
    renderCallTypesList(callTypes);
  } catch (error) {
    console.error('Error loading call types:', error);
    callTypesList.innerHTML = '<div class="text-red-500 text-center py-4">Error loading call types. Please try again.</div>';
  }
}

// Render the call types list
function renderCallTypesList(callTypes) {
  if (!callTypes || callTypes.length === 0) {
    callTypesList.innerHTML = `
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <p class="text-gray-600 mb-1">No call types defined yet</p>
        <p class="text-sm text-gray-500">Add your first call type to get started</p>
      </div>
    `;
    return;
  }

  callTypesList.innerHTML = '';
  callTypes.forEach(callType => {
    const callTypeElement = document.createElement('div');
    callTypeElement.classList.add('bg-white', 'border', 'border-gray-200', 'rounded-lg', 'p-5', 'shadow-sm', 'hover:shadow-md', 'transition-shadow');
    
    // No icons needed anymore
    
    callTypeElement.innerHTML = `
      <div class="p-4">
        <div class="flex justify-between items-start">
          <h3 class="font-semibold text-lg text-blue-600">${callType.name}</h3>
          <div class="flex gap-2">
            <button class="edit-btn text-white bg-blue-500 hover:bg-blue-600 px-2 py-1 text-xs rounded transition-colors" data-id="${callType.id}">
              Edit
            </button>
            <button class="delete-btn text-white bg-red-500 hover:bg-red-600 px-2 py-1 text-xs rounded transition-colors" data-id="${callType.id}">
              Delete
            </button>
          </div>
        </div>
        <div class="mt-3 description-content text-sm text-gray-600 description-container bg-gray-50 p-3 rounded-md max-h-[200px] overflow-auto">${callType.description}</div>
      </div>
    `;
    
    callTypesList.appendChild(callTypeElement);
    
    // Add event listeners to the buttons
    const editBtn = callTypeElement.querySelector('.edit-btn');
    const deleteBtn = callTypeElement.querySelector('.delete-btn');
    
    editBtn.addEventListener('click', () => openEditCallTypeModal(callType));
    deleteBtn.addEventListener('click', () => confirmDeleteCallType(callType));
  });
}

// Open the modal for adding a new call type
function openAddCallTypeModal() {
  modalTitle.textContent = 'Add New Call Type';
  callTypeId.value = '';
  callTypeName.value = '';
  quill.root.innerHTML = '';
  callTypeModal.classList.remove('hidden');
  
  // Set focus to the name field after a short delay to ensure modal is visible
  setTimeout(() => {
    callTypeName.focus();
  }, 100);
}

// Open the modal for editing an existing call type
function openEditCallTypeModal(callType) {
  modalTitle.textContent = 'Edit Call Type';
  callTypeId.value = callType.id;
  callTypeName.value = callType.name;
  quill.root.innerHTML = callType.description;
  callTypeModal.classList.remove('hidden');
  
  // Set focus to the name field after a short delay to ensure modal is visible
  setTimeout(() => {
    callTypeName.focus();
  }, 100);
}

// Close the modal
function closeModal() {
  callTypeModal.classList.add('hidden');
}

// Handle form submission for adding/editing a call type
async function handleCallTypeSubmit(event) {
  event.preventDefault();
  console.log('Form submitted');
  
  const id = callTypeId.value;
  const name = callTypeName.value.trim();
  const description = quill.root.innerHTML;
  
  console.log('Form data:', { id, name, description });
  
  if (!name) {
    alert('Please enter a call type name');
    return;
  }
  
  try {
    console.log('Attempting to save call type, id exists:', !!id);
    let result;
    if (id) {
      // Update existing call type
      console.log('Updating call type with id:', id);
      result = await window.electronAPI.updateCallType(id, { name, description });
      console.log('Update result:', result);
    } else {
      // Add new call type
      console.log('Adding new call type');
      result = await window.electronAPI.addCallType({ name, description });
      console.log('Add result:', result);
    }
    
    if (result && result.success) {
      console.log('Save successful, closing modal and refreshing list');
      closeModal();
      loadCallTypes(); // Refresh the list
    } else {
      console.error('Save failed:', result);
      alert(`Failed to save call type: ${(result && result.error) || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error saving call type:', error);
    alert(`Error saving call type: ${error.message || 'Unknown error'}`);
  }
}

// Confirm before deleting a call type
function confirmDeleteCallType(callType) {
  if (confirm(`Are you sure you want to delete the call type "${callType.name}"?`)) {
    deleteCallType(callType.id);
  }
}

// Delete a call type
async function deleteCallType(id) {
  try {
    const result = await window.electronAPI.deleteCallType(id);
    if (result.success) {
      loadCallTypes(); // Refresh the list
    } else {
      alert('Failed to delete call type');
    }
  } catch (error) {
    console.error('Error deleting call type:', error);
    alert(`Error deleting call type: ${error.message || 'Unknown error'}`);
  }
}