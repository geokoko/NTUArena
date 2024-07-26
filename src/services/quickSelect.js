// Implementation of the quickselect algorithm, which is a selection algorithm to find the k-th smallest element in an unordered list. It is related to the quicksort sorting algorithm.
// Aiming to generate pairs at O(n^2) time complexity
function partition(arr, left, right, pivotIndex) {
    const pivotValue = arr[pivotIndex].score;
    [arr[pivotIndex], arr[right]] = [arr[right], arr[pivotIndex]]; // Move pivot to end
    let storeIndex = left;
    for (let i = left; i < right; i++) {
        if (arr[i].score < pivotValue) {
            [arr[storeIndex], arr[i]] = [arr[i], arr[storeIndex]];
            storeIndex++;
        }
    }
    [arr[right], arr[storeIndex]] = [arr[storeIndex], arr[right]]; // Move pivot to its final place
    return storeIndex;
}

function quickselect(arr, left, right, k) {
    if (left === right) return arr[left];
    let pivotIndex = Math.floor(Math.random() * (right - left + 1)) + left;
    pivotIndex = partition(arr, left, right, pivotIndex);
    if (k === pivotIndex) {
        return arr[k];
    } else if (k < pivotIndex) {
        return quickselect(arr, left, pivotIndex - 1, k);
    } else {
        return quickselect(arr, pivotIndex + 1, right, k);
    }
}

module.exports = quickselect;
