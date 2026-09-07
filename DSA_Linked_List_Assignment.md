# DSA Assignment: Singly and Doubly Linked Lists

**Topic:** Traversal, Creation, Insertion, Searching, and Deletion  
**Language:** C++  
**Level:** Beginner

## Objective

Learn the basic operations of a singly linked list and a doubly linked list by implementing them with simple functions.

## Instructions

1. Read the code and run it.
2. Change the values in `main()` and observe the output.
3. Complete the practice questions at the end.
4. Submit the source code and screenshots of the output.

---

## Part A: Singly Linked List

In a singly linked list, every node stores data and a pointer to the next node.

### Operations included

- Creation: `createNode`
- Traversal: `display`
- Insertion: `insertAtBeginning`, `insertAtEnd`
- Searching: `search`
- Deletion: `deleteValue`

```cpp
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
};

// Create one new node
Node* createNode(int value) {
    Node* newNode = new Node;
    newNode->data = value;
    newNode->next = NULL;
    return newNode;
}

// Traverse and print the list
void display(Node* head) {
    if (head == NULL) {
        cout << "List is empty" << endl;
        return;
    }

    Node* temp = head;
    while (temp != NULL) {
        cout << temp->data << " -> ";
        temp = temp->next;
    }
    cout << "NULL" << endl;
}

// Insert a node at the beginning
void insertAtBeginning(Node*& head, int value) {
    Node* newNode = createNode(value);
    newNode->next = head;
    head = newNode;
}

// Insert a node at the end
void insertAtEnd(Node*& head, int value) {
    Node* newNode = createNode(value);

    if (head == NULL) {
        head = newNode;
        return;
    }

    Node* temp = head;
    while (temp->next != NULL) {
        temp = temp->next;
    }
    temp->next = newNode;
}

// Search for a value
void search(Node* head, int value) {
    Node* temp = head;
    int position = 1;

    while (temp != NULL) {
        if (temp->data == value) {
            cout << value << " found at position " << position << endl;
            return;
        }
        temp = temp->next;
        position++;
    }

    cout << value << " not found" << endl;
}

// Delete the first node containing value
void deleteValue(Node*& head, int value) {
    if (head == NULL) {
        cout << "List is empty" << endl;
        return;
    }

    if (head->data == value) {
        Node* deleteNode = head;
        head = head->next;
        delete deleteNode;
        return;
    }

    Node* temp = head;
    while (temp->next != NULL && temp->next->data != value) {
        temp = temp->next;
    }

    if (temp->next == NULL) {
        cout << value << " not found" << endl;
        return;
    }

    Node* deleteNode = temp->next;
    temp->next = deleteNode->next;
    delete deleteNode;
}

int main() {
    Node* head = NULL;

    // Creation and insertion
    insertAtEnd(head, 10);
    insertAtEnd(head, 20);
    insertAtEnd(head, 30);
    cout << "Initial list: ";
    display(head);

    insertAtBeginning(head, 5);
    cout << "After inserting 5 at beginning: ";
    display(head);

    insertAtEnd(head, 40);
    cout << "After inserting 40 at end: ";
    display(head);

    search(head, 20);
    search(head, 99);

    deleteValue(head, 20);
    cout << "After deleting 20: ";
    display(head);

    return 0;
}
```

**Expected output**

```text
Initial list: 10 -> 20 -> 30 -> NULL
After inserting 5 at beginning: 5 -> 10 -> 20 -> 30 -> NULL
After inserting 40 at end: 5 -> 10 -> 20 -> 30 -> 40 -> NULL
20 found at position 3
99 not found
After deleting 20: 5 -> 10 -> 30 -> 40 -> NULL
```

---

## Part B: Doubly Linked List

In a doubly linked list, each node has a pointer to both the previous and next node. This allows traversal in forward and backward directions.

### Operations included

- Creation: `createNode`
- Traversal: `displayForward`, `displayBackward`
- Insertion: `insertAtBeginning`, `insertAtEnd`
- Searching: `search`
- Deletion: `deleteValue`

```cpp
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* prev;
    Node* next;
};

// Create one new node
Node* createNode(int value) {
    Node* newNode = new Node;
    newNode->data = value;
    newNode->prev = NULL;
    newNode->next = NULL;
    return newNode;
}

// Traverse from first node to last node
void displayForward(Node* head) {
    Node* temp = head;
    while (temp != NULL) {
        cout << temp->data << " <-> ";
        temp = temp->next;
    }
    cout << "NULL" << endl;
}

// Traverse from last node to first node
void displayBackward(Node* head) {
    if (head == NULL) {
        cout << "List is empty" << endl;
        return;
    }

    Node* temp = head;
    while (temp->next != NULL) {
        temp = temp->next;
    }

    while (temp != NULL) {
        cout << temp->data << " <-> ";
        temp = temp->prev;
    }
    cout << "NULL" << endl;
}

// Insert at beginning
void insertAtBeginning(Node*& head, int value) {
    Node* newNode = createNode(value);

    if (head != NULL) {
        newNode->next = head;
        head->prev = newNode;
    }
    head = newNode;
}

// Insert at end
void insertAtEnd(Node*& head, int value) {
    Node* newNode = createNode(value);

    if (head == NULL) {
        head = newNode;
        return;
    }

    Node* temp = head;
    while (temp->next != NULL) {
        temp = temp->next;
    }

    temp->next = newNode;
    newNode->prev = temp;
}

// Search for a value
void search(Node* head, int value) {
    Node* temp = head;
    int position = 1;

    while (temp != NULL) {
        if (temp->data == value) {
            cout << value << " found at position " << position << endl;
            return;
        }
        temp = temp->next;
        position++;
    }
    cout << value << " not found" << endl;
}

// Delete the first node containing value
void deleteValue(Node*& head, int value) {
    Node* temp = head;

    while (temp != NULL && temp->data != value) {
        temp = temp->next;
    }

    if (temp == NULL) {
        cout << value << " not found" << endl;
        return;
    }

    if (temp->prev != NULL) {
        temp->prev->next = temp->next;
    } else {
        head = temp->next;
    }

    if (temp->next != NULL) {
        temp->next->prev = temp->prev;
    }

    delete temp;
}

int main() {
    Node* head = NULL;

    // Creation and insertion
    insertAtEnd(head, 10);
    insertAtEnd(head, 20);
    insertAtEnd(head, 30);
    cout << "Forward traversal: ";
    displayForward(head);

    insertAtBeginning(head, 5);
    insertAtEnd(head, 40);
    cout << "After insertion: ";
    displayForward(head);

    cout << "Backward traversal: ";
    displayBackward(head);

    search(head, 30);
    search(head, 99);

    deleteValue(head, 20);
    cout << "After deleting 20: ";
    displayForward(head);

    return 0;
}
```

**Expected output**

```text
Forward traversal: 10 <-> 20 <-> 30 <-> NULL
After insertion: 5 <-> 10 <-> 20 <-> 30 <-> 40 <-> NULL
Backward traversal: 40 <-> 30 <-> 20 <-> 10 <-> 5 <-> NULL
30 found at position 4
99 not found
After deleting 20: 5 <-> 10 <-> 30 <-> 40 <-> NULL
```

---

## Practice Questions

1. Add a function to insert a node after a given value in the singly linked list.
2. Add a function to insert a node at a given position in the doubly linked list.
3. Delete the first node in both lists.
4. Delete the last node in both lists.
5. Count and print the total number of nodes.
6. Try searching for the first value, last value, and a value that is not present.

## Viva Questions

1. What is a linked list?
2. What is the difference between an array and a linked list?
3. What are the advantages of a doubly linked list?
4. Why do we use `Node*& head` in insertion and deletion functions?
5. What is the time complexity of traversal and searching in a linked list?

## Submission Checklist

- Source code for singly linked list
- Source code for doubly linked list
- Output screenshots
- Answers to practice and viva questions
