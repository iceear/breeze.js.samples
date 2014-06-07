// ReSharper disable InconsistentNaming
// ReSharper disable UnusedLocals
(function (testFns) {
    "use strict";

    /*********************************************************
    * Breeze configuration and module setup 
    *********************************************************/
    var breeze = testFns.breeze;
    var MetadataStore = breeze.MetadataStore;
    var EntityManager = breeze.EntityManager;
    var EntityQuery = breeze.EntityQuery;
    var EntityState = breeze.EntityState;

    var moduleMetadataStore = new MetadataStore();
    var northwindService = testFns.northwindServiceName;
    var todoService = testFns.todosServiceName;
    var handleFail = testFns.handleFail;

    module("entityExtensionTests", { setup: moduleMetadataStoreSetup });

    // Populate the moduleMetadataStore with Northwind service metadata
    function moduleMetadataStoreSetup() {
        if (!moduleMetadataStore.isEmpty()) return; // got it already

        stop(); // going async for metadata ...
        Q.all(
            moduleMetadataStore.fetchMetadata(northwindService),
            moduleMetadataStore.fetchMetadata(todoService))
        .fail(handleFail)
        .fin(start);
    }

    /*********************************************************
    * add untracked property directly to customer instance
    *********************************************************/
    test("add untracked 'isPartial' property directly to customer instance", 1, function () {

        var em = newEm();
        var cust = em.createEntity('Customer', {
            CustomerID: testFns.newGuidComb()
        });

        // property added to instance
        cust.isPartial = ko.observable(false);

        // can get the type from the entity instance
        var custType = cust.entityType;
        var propInfo = custType.getProperty("isPartial");

        // The Breeze customerType knows nothing about it.
        ok(propInfo === null, "'isPartial' should be unknown to the customer type");
    });
    
    /*********************************************************
    * add unmapped property via constructor
    *********************************************************/
    test("add unmapped 'isPartial' property via constructor", 6, function () {
        var store = cloneModuleMetadataStore();
        
        var Customer = function () {
            // These are simple 'field' properties.
            // Breeze converts them to the right kind of properties  
            // for the prevailing modelLibrary adapter
            // such as KO observable properties.
            this.CustomerID = testFns.newGuidComb();
            this.isPartial = true;
        };
        
        store.registerEntityTypeCtor('Customer', Customer);

        var em = newEm(store);
        var cust = em.createEntity('Customer'); 

        assertExpectedCustomerCtorProperties(cust);
    });

    function assertExpectedCustomerCtorProperties(cust) {
        // can get the type from the entity instance
        var custType = cust.entityType;
        ok(custType, "'cust' is now an entity");

        // Breeze converted both into KO observables
        ok(typeof cust.CustomerID === 'function',
            "'CustomerID' should be a KO observable");

        ok(typeof cust.isPartial === 'function',
            "'isPartial' should be a KO observable");

        if (!custType) {return;} // no remaining tests would pass
        
        var propInfo = custType.getProperty('CustomerID');
        ok(propInfo && !propInfo.isUnmapped && propInfo.isPartOfKey,
            "'CustomerID' should be detected as a mapped property");

        propInfo = custType.getProperty('isPartial');
        ok(propInfo && propInfo.isUnmapped,
            "'isPartial' should be an unmapped property");

        var unmapped = custType.unmappedProperties;
        ok(unmapped.length === 1,
            "'isPartial' should be the lone unmapped property");
    }

    /*********************************************************
    * can 'new' the ctor .. but not a full entity until added to manager
    * not recommended; prefer CreateEntity approach
    *********************************************************/
    test("can 'new' an entity via custom ctor and add to manager", 8, function () {
        var store = cloneModuleMetadataStore();

        var Customer = function () {
            this.CustomerID = testFns.newGuidComb();
            this.isPartial = true; 
        };

        store.registerEntityTypeCtor('Customer', Customer);

        var cust = new Customer(); // not recommended!!

        // they aren't observables until they're added to the manager
        ok(typeof cust.CustomerID !== 'function',
            "'CustomerID' should NOT be a KO observable before adding to em");

        ok(typeof cust.isPartial !== 'function',
            "'isPartial' should NOT be a KO observable before adding to em");

        var em = newEm(store);
        em.addEntity(cust);

        // now they are observables
        assertExpectedCustomerCtorProperties(cust);

    });

    /*********************************************************
    * can add unmapped 'foo' property via constructor
    *********************************************************/
    test("can add unmapped 'foo' property via constructor", 4, function () {
        var store = cloneModuleMetadataStore();
        assertFooPropertyDefined(store, false);

        var Customer = function () {
            this.foo = 42; // doesn't have to be KO observable; will become observable
        };
        store.registerEntityTypeCtor('Customer', Customer);
        assertFooPropertyDefined(store, true);

        var cust = store.getEntityType('Customer').createEntity();

        ok(cust["foo"],
            "should have 'foo' property via constructor");

        equal(cust.foo(), 42,
            "'foo' should be a KO 'property' returning 42");
    });

    /*********************************************************
    * can add unmapped 'foo' property directly to EntityType
    *********************************************************/
    test("can add unmapped 'foo' property directly to EntityType", 4, function () {
        var store = cloneModuleMetadataStore();
        assertFooPropertyDefined(store, false);

        var customerType = store.getEntityType('Customer');
        var fooProp = new breeze.DataProperty({
            name: 'foo',
            defaultValue: 42,
            isUnmapped: true,  // !!!
        });
        customerType.addProperty(fooProp);

        assertFooPropertyDefined(store, true);

        var cust = store.getEntityType('Customer').createEntity();

        ok(cust["foo"],
            "should have 'foo' property via constructor");

        equal(cust.foo(), 42,
            "'foo' should be a KO 'property' returning 42");
    });

    /*********************************************************
    * can query an unmapped property with cache query
    *********************************************************/
    test("can query an unmapped property with cache query", 3, function() {
        // Add unmapped 'foo' property via its custom constructor
        var store = cloneModuleMetadataStore();
        var Customer = function() {
            this.foo = 42; // doesn't have to be KO observable; will become observable
        };
        store.registerEntityTypeCtor('Customer', Customer);
        assertFooPropertyDefined(store, true);

        var manager = newEm(store);

        // Create a customer with the target foo value
        var fooValue = 60;
        var cust = manager.createEntity('Customer', {
            CustomerID: testFns.newGuid(),
            foo: fooValue,
            CompanyName: 'Test'
        });

        // Create another customer with a different foo value
        manager.createEntity('Customer', {
            CustomerID: testFns.newGuid(),
            foo: fooValue + 1 ,
            CompanyName: 'Test2'
        });

        // Now have 2 customers in cache; query for the one with target foo value
        var results = manager.executeQueryLocally(
            EntityQuery.from('Customers').where('foo', 'eq', fooValue));

        equal(results.length, 1, "cache query returned exactly 1 result.");

        var queriedCustomer = results[0];
        if (queriedCustomer) {
            ok(true, "cache query returned customer '{0}' with foo==={1}"
                .format(queriedCustomer.CompanyName(), queriedCustomer.foo()));
        } else {
            ok(false, "cache query failed to return a Customer with foo===" + fooValue);

        }
    });

    /*********************************************************
    * unmapped 'foo' property is validated
    *********************************************************/
    test("unmapped 'foo' property is validated", 5, function () {
        var store = cloneModuleMetadataStore();
        assertFooPropertyDefined(store);
        // Arrange for 'foo' to be an unmapped Customer property
        var Customer = function () {
            this.foo = "";
        };
        store.registerEntityTypeCtor("Customer", Customer);
        var fooProp = assertFooPropertyDefined(store, true);

        var maxLengthValidator = breeze.Validator.maxLength({maxLength:5});
        fooProp.validators.push(maxLengthValidator);

        // create new customer
        var manager = newEm(store);
        var cust = manager.createEntity('Customer', {CustomerID: testFns.newGuidComb()});

        cust.foo("funky");
        var errs = cust.entityAspect.getValidationErrors(fooProp);
        ok(0 === errs.length,
            "should not have validation errors about 'foo'.");

        cust.foo("funky and fresh");
        errs = cust.entityAspect.getValidationErrors(fooProp);
        equal(errs.length, 1,
            "should have one validation error about 'foo'.");

        var errMsg = errs[0].errorMessage;
        ok(/foo.*or less/.test(errMsg),
            "error message, \"{0}\", should complain that 'foo' is too long."
            .format(errMsg));

    });
  
    /*********************************************************
    * Changes to properties within ctor do NOT change EntityState
    * Doesn't matter if they are mapped or unmapped
    *********************************************************/
    asyncTest("changes to properties within ctor should not change EntityState", 3, function () {

        var store = cloneModuleMetadataStore();
        var employeeCtor = function () {
            // Mapped properties
            this.FirstName = "Jolly";
            this.LastName = "Rodger";
            // Unmapped property
            this.FunkyName = "Funky";
        };
        store.registerEntityTypeCtor("Employee", employeeCtor);
        
        var em = newEm(store);

        EntityQuery.from('Employees').top(1)
            .using(em).execute()
            .then(success).fail(handleFail).fin(start);

        function success(data) {
            var emp = data.results[0];
            var stateName = emp.entityAspect.entityState.name;
            equal(stateName, EntityState.Unchanged.name,
                "queried entity whose ctor sets properties should remain Unchanged");
            notEqual(emp.FirstName(), "Jolly",
                "queried entity's initial FirstName should be overridden by query; is " + emp.FirstName());
            deepEqual(emp.entityAspect.originalValues, {},
                "queried entity should have no 'originalValues' and therefore no initial values to 'restore'.");
        }
    });

    /*********************************************************
    * changes to properties within custom initializer should not change EntityState
    * even if change is to mapped property
    *********************************************************/
    asyncTest("changes to properties within custom initializer should not change EntityState", 3, function () {

        var store = cloneModuleMetadataStore();
        var employeeInitializer = function (emp) {           
            emp.FirstName("Jolly"); // change a mapped property
        };
        store.registerEntityTypeCtor("Employee", null, employeeInitializer);

        var em = newEm(store);

        EntityQuery.from('Employees').top(1)
            .using(em).execute()
            .then(success).fail(handleFail).fin(start);

        function success(data) {
            var emp = data.results[0];
            var stateName = emp.entityAspect.entityState.name;
            equal(stateName, EntityState.Unchanged.name,
                "queried entity whose initer set a mapped property should remain Unchanged");
            equal(emp.FirstName(), "Jolly",
                "queried entity's FirstName should be overridden by initer; is " + emp.FirstName());
            deepEqual(emp.entityAspect.originalValues, {},
                "queried entity should have no 'originalValues' and therefore no initial values to 'restore'.");
        }
    });

    /*********************************************************
    * when unmapped property changes, what happens to 
    * notifications, EntityState, and originalValues
    *********************************************************/
    test("change to unmapped 'foo' property does not change EntityState", 5, function () {

        // Arrange for 'foo' to be an unmapped Customer property
        var store = cloneModuleMetadataStore();
        var Customer = function () {
            this.foo = 42;
        };
        store.registerEntityTypeCtor("Customer", Customer);

        assertFooPropertyDefined(store, true);
        
        // Fake an existing customer
        var manager = newEm(store);
        var cust = manager.createEntity(
            'Customer',
            { CustomerID: testFns.newGuidComb() },
              EntityState.Unchanged);

        // Listen for foo changes
        var koFooNotified, breezeFooNotified;
        cust.foo.subscribe(function () { koFooNotified = true; });
        cust.entityAspect.propertyChanged.subscribe(function (args) {
            if (args.propertyName === "foo") { breezeFooNotified = true; }
        });

        // Act
        cust.foo(12345);

        ok(koFooNotified, "KO should have raised property changed for 'foo'.");
        ok(breezeFooNotified, "Breeze should have raised its property changed for 'foo'.");

        var stateName = cust.entityAspect.entityState.name;
        equal(stateName, "Unchanged",
            "cust's EntityState should still be 'Unchanged'; it is " + stateName);

        var originalValues = cust.entityAspect.originalValues;
        var hasOriginalValues = null;
        for (var key in originalValues) {
            if (key === 'foo') {
                hasOriginalValues = true;
                break;
            }
        }

        ok(hasOriginalValues,
            "'originalValues' have 'foo'; it is " + JSON.stringify(originalValues));
    });
    
    /*********************************************************
    * reject changes should revert an unmapped property
    *********************************************************/
    test("reject changes reverts an unmapped property", 2, function () {
        var store = cloneModuleMetadataStore();

        var originalTime = new Date(2013, 0, 1);
        var Customer = function () {
            this.lastTouched = originalTime;
        };

        store.registerEntityTypeCtor("Customer", Customer);

        var manager = newEm(store);

        // create a fake customer
        var cust = manager.createEntity("Customer", { CompanyName: "Acme" },
                   EntityState.Unchanged);
        var touched = cust.lastTouched();

        // an hour passes ... and we visit the customer object
        cust.CompanyName("Beta");
        cust.lastTouched(touched = new Date(touched.getTime() + 60000));

        // an hour passes ... and we visit to cancel
        cust.lastTouched(new Date(touched.getTime() + 60000));
        
        cust.entityAspect.rejectChanges(); // roll back name change
        //manager.rejectChanges(); // would have same effect. Obviously less granular
        
        equal(cust.CompanyName(), "Acme", "'name' data property should be rolled back");
        ok(originalTime === cust.lastTouched(),
            "'lastTouched' unmapped property should be rolled back. Started as {0}; now is {1}"
            .format(originalTime, cust.lastTouched()));
    });

    /*********************************************************
    * unmapped properties are not persisted
    *********************************************************/
    test("unmapped properties are not persisted", 9, function () {

        var store = cloneModuleMetadataStore();
        
        var TodoItemCtor = function () {
            this.foo = 0;
        };
        store.registerEntityTypeCtor("TodoItem", TodoItemCtor);
        
        var todoType = store.getEntityType("TodoItem");
        var fooProp = todoType.getProperty('foo');
        ok(fooProp && fooProp.isUnmapped,
            "'foo' should be an unmapped property after registration");

        // Create manager that uses this extended TodoItem
        var manager = new EntityManager({
            serviceName: todoService,
            metadataStore: store
        });

        // Add new Todo
        var todo = manager.createEntity(todoType.name);
        var operation, description; // testing capture vars

        stop(); // going async

        saveAddedTodo()
            .then(saveModifiedTodo)
            .then(saveDeletedTodo)
            .fail(handleFail)
            .fin(start);

        function saveAddedTodo() {
            changeDescription("add");
            todo.foo(42);
            return manager.saveChanges().then(saveSucceeded);
        }
        function saveModifiedTodo() {
            changeDescription("update");
            todo.foo(84);
            return manager.saveChanges().then(saveSucceeded);
        }
        function saveDeletedTodo() {
            changeDescription("delete");
            todo.foo(21);
            todo.entityAspect.setDeleted();
            return manager.saveChanges().then(saveSucceeded);
        }

        function changeDescription(op) {
            operation = op;
            description = op + " entityExtensionTest";
            todo.Description(description);
        }
        function saveSucceeded(/*saveResult*/) {

            notEqual(todo.foo(), 0, "'foo' retains its '{0}' value after '{1}' save succeeded but ..."
                .format(todo.foo(), operation));

            // clear the cache and requery the Todo
            manager.clear();
            return EntityQuery.fromEntities(todo).using(manager).execute().then(requerySucceeded);

        }
        function requerySucceeded(data) {
            if (data.results.length === 0) {
                if (operation === "delete") {
                    ok(true, "todo should be gone from the database after 'delete' save succeeds.");
                }else {
                    ok(false, "todo should still be in the database after '{0}' save.".format(operation));
                }
                return;
            }

            todo = data.results[0];
            equal(todo.foo(), 0, "'foo' should have reverted to '0' after cache-clear and re-query.");
            equal(todo.Description(), description,
                    "'Description' should be '{0}' after {1} succeeded and re-query".format(description, operation));
        }
    });

    /*********************************************************
    * unmapped property can be set by server class calculated property
    *********************************************************/
    test("unmapped property can be set by a calculated property of the server class", 4, function () {

        var store1 = cloneModuleMetadataStore();

        var store2 = cloneModuleMetadataStore();
        var employeeCtor = function () {
            //'Fullname' is a server-side calculated property of the Employee class
            // This unmapped property will be empty for new entities
            // but will be set for existing entities during query materialization
            this.FullName = ""; 
        };
        store2.registerEntityTypeCtor("Employee", employeeCtor);


        var em1 = newEm(store1); // no unmapped properties registered
        var prop = em1.metadataStore.getEntityType('Employee').getProperty('FullName');
        ok(!prop,
            "'FullName' should NOT be a registered property of 'em1'.");

        var em2 = newEm(store2);
        prop = em2.metadataStore.getEntityType('Employee').getProperty('FullName');
        ok(prop && prop.isUnmapped,
            "'FullName' should be an unmapped property in 'em2'");
        
        var query = EntityQuery.from('Employees');
        var p1 = em1.executeQuery(query).then(success1);
        var p2 = em2.executeQuery(query).then(success2);

        stop(); // going async

        Q.all([p1, p2]).fail(handleFail).fin(start);
        
        function success1(data) {
            var first = data.results[0];
            var fullname = first.FullName;
            ok(!fullname, "an Employee queried with 'em1' should NOT have a 'FullName' property, let alone a value for it");
        }
        
        function success2(data) {
            var first = data.results[0];
            var fullname = first.FullName();
            ok(fullname, "an Employee queried with 'em2' should have a calculated FullName ('Last, First'); it is '{0}'"
                .format(fullname));
        }

    });

    /*********************************************************
    * add instance function via constructor
    *********************************************************/
    test("add instance function via constructor", 3, function () {
        var store = cloneModuleMetadataStore();

        var Customer = function () {
            this.foo = function () { return 42;};
        };

        store.registerEntityTypeCtor("Customer", Customer);

        var customerType = store.getEntityType("Customer");
        var cust = customerType.createEntity();

        ok(cust["foo"],
            "should have 'foo' property via constructor");

        // 'foo' is a non-KO function; it is NOT listed as an unmapped property
        // The Breeze customerType knows nothing about it.
        var propInfo = customerType.getProperty("foo");
        ok(propInfo === null, "'foo' should be unknown to the customer type");

        equal(cust.foo(), 42,
            "'foo' should be a function returning 42");
    });
    
    /*********************************************************
    * add mapped data property via constructor
    *********************************************************/
    test("add mapped data property via constructor", 7, function () {
        var store = cloneModuleMetadataStore();

        var Customer = function () {
            this.CompanyName = "Acme"; // a field, not a KO property
            this.ContactName = ko.observable("Amy"); // is a KO property
        };

        store.registerEntityTypeCtor("Customer", Customer);

        var customerType = store.getEntityType("Customer");
        var cust = customerType.createEntity();

        ok(cust["CompanyName"],
            "should have 'CompanyName' property via constructor");

        // 'CompanyName' is a mapped data property
        var propInfo = customerType.getProperty("CompanyName");
        ok(propInfo !== null,
            "'CompanyName' should be known to the customer type");
        ok(propInfo && !propInfo.isUnmapped,
            "'CompanyName' should be a mapped property");
        
        // Although defined as a field, Breeze made it a KO property and initialized it
        equal(cust.CompanyName(), "Acme",
            "'CompanyName' should be a KO 'property' returning 'Acme'");

        // Breeze preserved the ContactName KO property as a mapped data property
        propInfo = customerType.getProperty("ContactName");
        ok(propInfo !== null,
            "'ContactName' should be known to the customer type");
        ok(propInfo && !propInfo.isUnmapped,
            "'ContactName' should be a mapped property");
        equal(cust.ContactName(), "Amy",
            "'ContactName' should be a KO 'property' returning 'Amy'");
    });

    /*********************************************************
    * add method to prototype via constructor
    *********************************************************/
    test("add method to prototype via constructor", 2, function () {
        var store = cloneModuleMetadataStore();

        var Customer = function () { };
        
        Customer.prototype.sayHi = function () {
            return "Hi, my name is {0}!".format(this.CompanyName());
        };
        
        store.registerEntityTypeCtor("Customer", Customer);

        var customerType = store.getEntityType("Customer");
        var cust = customerType.createEntity();
        cust.CompanyName("Acme");

        ok(cust["sayHi"],
            "should have 'sayHi' member via constructor");

        var expected = "Hi, my name is Acme!";
        equal(cust.sayHi(), expected,
            "'sayHi' function should return expected message, '{0}'."
                .format(expected));
    });


    /*********************************************************
    * can add unmapped readonly ES5 property via constructor
    * add breeze exports/imports just fine
    *********************************************************/
    test("can add unmapped readonly ES5 property via constructor", 4, function () {
        "use strict";
        var store = cloneModuleMetadataStore();

        var Customer = function () { };

        Object.defineProperty(Customer.prototype, 'foo', {
            get: function () { return 42; },
            enumerable: true,
            configurable: true
        });

        store.registerEntityTypeCtor('Customer', Customer);
        assertFooPropertyDefined(store, true);

        var em = newEm(store);
        
        var cust = em.createEntity('Customer', {
            CustomerID: testFns.newGuid(),
            CompanyName: "test cust"
        });

        equal(cust.foo(), 42, "'cust.foo' should return 42");

        var exported = em.exportEntities([cust], false); // no metadata

        // Change the exported the foo property value. It shouldn't matter
        exported = exported.replace(/("foo":42)/, '"foo":100');

        ok(/("foo":100)/.test(exported),
            "replaced 42 with 100 in exported: exported is:\n" + exported);

        var cust2 = em.importEntities(exported).entities[0];

        equal(cust2.foo(), 42, "imported 'cust2.foo' should return 42 after import");
    });


    /*********************************************************
    * knockout computed property via constructor
    *********************************************************/
    test("add knockout computed property via constructor", 2, function () {
        var store = cloneModuleMetadataStore();

        var Employee = function () {
            this.fullName = ko.computed(
                {
                    read: function () {
                        return this.FirstName() + " " + this.LastName();
                    },
                    // required because FirstName and LastName not yet defined
                    deferEvaluation: true 
                }, this);
        };

        store.registerEntityTypeCtor("Employee", Employee);

        var employeeType = store.getEntityType("Employee");
        var emp = employeeType.createEntity();
        emp.FirstName("John");
        emp.LastName("Doe");

        ok(emp["fullName"],
            "should have 'fullName' member via constructor");

        var expected = "John Doe";
        equal(emp.fullName(), expected,
            "'fullName' KO computed should return , '{0}'."
                .format(expected));
    });

    /*********************************************************
    * knockout computed property based on collection navigation via constructor
    *********************************************************/
    test("add knockout computed property based on collection navigation via constructor", 2,
        function () {
        var store = cloneModuleMetadataStore();

        var Employee = function () {
            this.orderCount = ko.computed(
                {
                    read: function () {
                        return this.Orders().length;
                    },
                    // Orders not defined yet
                    deferEvaluation: true
                }, this);
        };

        store.registerEntityTypeCtor("Employee", Employee);

        var employeeType = store.getEntityType("Employee");
        var emp = employeeType.createEntity();

        equal(emp.orderCount(),0,
            "should have a zero orderCount");

        var orderType = store.getEntityType("Order");
        var newOrder = orderType.createEntity();
        emp.Orders.push(newOrder);
            
        equal(emp.orderCount(), 1,
            "orderCount should be 1 after pushing newOrder");
        });
   /*********************************************************
   * knockout computed property w/ re-defined mapped dependent properties
   *********************************************************/
    test("add knockout computed property w/ re-defined mapped dependent properties", 3,
        function () {
            var store = cloneModuleMetadataStore();

            var Employee = function () {
                var self = this;
                self.FirstName = ko.observable(""); // default FirstName
                self.LastName = ko.observable("");  // default LastName
                self.fullName = ko.computed(
                        function () {
                            return self.FirstName() + " " + self.LastName();
                        });
            };

            store.registerEntityTypeCtor("Employee", Employee);

            var employeeType = store.getEntityType("Employee");
            var emp = employeeType.createEntity();
            emp.FirstName("John");
            emp.LastName("Doe");

            ok(emp["fullName"],
                "should have 'fullName' member via constructor");

            var expected = "John Doe";
            equal(emp.fullName(), expected,
                "created 'emp.fullName' KO computed should return , '{0}'."
                    .format(expected));

            // Now show it works for materialized query entity
            var query = breeze.EntityQuery.from("Employees").top(1);
            var em = newEm(store);

            stop(); // going async
            em.executeQuery(query)
            .then(function (data) {
                var emp2 = data.results[0];
                var expected2 = emp2.FirstName() + " " + emp2.LastName();
                equal(emp2.fullName(), expected2,
                    "materialized 'emp2.fullName' KO computed should return , '{0}'."
                        .format(expected2));
            })
            .fail(handleFail)
            .fin(start);
    });
    /*********************************************************
    * add subscription in post-construction initializer
    *********************************************************/
    test("add subscription in post-construction initializer", 1, function () {
        var store = cloneModuleMetadataStore();

        var Customer = function () {};

        var companyNameNotificationCount = 0;
        var customerInitializer = function(customer) {
            customer.CompanyName.subscribe(
                function (/*newValue*/) {
                    companyNameNotificationCount += 1;
            });
        };
        
        store.registerEntityTypeCtor("Customer", Customer, customerInitializer);

        var customerType = store.getEntityType("Customer");
        var cust = customerType.createEntity();

        cust.CompanyName("Beta");

        equal(companyNameNotificationCount, 1,
            "should have raised 'CompanyName' change notification once");
    });
    /*********************************************************
    * add property in post-construction initializer
    *********************************************************/
    test("add property in post-construction initializer", 2, function () {
        var store = cloneModuleMetadataStore();

        var Customer = function () { };

        var customerInitializer = function (customer) {
            customer.foo = "Foo " + customer.CompanyName();
        };

        store.registerEntityTypeCtor("Customer", Customer, customerInitializer);

        var customerType = store.getEntityType("Customer");
        var cust = customerType.createEntity();

        equal(cust.foo, "Foo ",
            "'foo' property, created in initializer, should return 'Foo");
        
        var propInfo = customerType.getProperty("foo");
        // The Breeze customerType knows nothing about it.
        ok(propInfo === null, "'foo' should be unknown to the customer type");

    });
    /*********************************************************
    * knockout computed property based on collection navigation via initializer
    *********************************************************/
    test("add knockout computed property based on collection navigation via initializer", 2,
        function () {
            var store = cloneModuleMetadataStore();

            var employeeInitializer = function (employee) {
                employee.orderCount = ko.computed(
                    {
                        read: function () {
                            return employee.Orders().length;
                        },
                        // Orders not defined yet
                        deferEvaluation: true
                    });
            };

            store.registerEntityTypeCtor("Employee", function (){}, employeeInitializer);

            var employeeType = store.getEntityType("Employee");
            var emp = employeeType.createEntity();

            equal(emp.orderCount(), 0,
                "should have a zero orderCount");

            var orderType = store.getEntityType("Order");
            var newOrder = orderType.createEntity();
            emp.Orders.push(newOrder);

            equal(emp.orderCount(), 1,
                "orderCount should be 1 after pushing newOrder");
        });
    /*********************************************************
    * initializer called by importEntities
    *********************************************************/
    test("initializer called by importEntities", 5, function () {
        
        // ARRANGE
        // Start with clean metadataStore copy; no registrations
        var store = cloneModuleMetadataStore();

        // define and register employee initializer
        store.registerEntityTypeCtor("Employee", null, employeeFooInitializer);

        // define manager using prepared test store
        var em1 = new breeze.EntityManager({
            serviceName: northwindService,
            metadataStore: store
        });
        
        var emp = createEmployee42();
        em1.attachEntity(emp);
        var exportData = em1.exportEntities();

        /* Create em2 with with registration only
        * expecting metadata from import to fill in the entityType gaps
        * Emulate launching a disconnected app
        * and loading data from local browser storage */

        var em2 = new breeze.EntityManager(northwindService);
        em2.metadataStore.registerEntityTypeCtor("Employee", null, employeeFooInitializer);
        
        /* Create em2 with copy constructor
        * In this path, em2 all entityType metadata + registration
        * Not realistic. */
        
        //var em2 = em1.createEmptyCopy(); // has ALL metadata
        
        // ACTION
        em2.importEntities(exportData);
        
        // ASSERT
        var emp2 = em2.findEntityByKey(emp.entityAspect.getKey());

        ok(emp2 !== null, "should find imported 'emp' in em2");
        ok(emp2 && emp2.foo,
            "emp from em2 should have 'foo' property from initializer");
        equal(emp2 && emp2.foo, "Foo Test",
           "emp from em2 should have expected foo value");
        ok(emp2 && emp2.fooComputed,
          "emp from em2 should have 'fooComputed' observable from initializer");
        equal(emp2 && emp2.fooComputed && emp2.fooComputed(), "Foo Test",
           "emp from em2 should have expected fooComputed value");
        
        function createEmployee42() {
            var employeeType = store.getEntityType("Employee");
            var employee = employeeType.createEntity();
            employee.EmployeeID(42);
            employee.LastName("Test");
            return employee;
        }
    });
    function employeeFooInitializer (employee) {
        employee.foo = "Foo " + employee.LastName();
        employee.fooComputed = ko.computed(function () {
            return "Foo " + employee.LastName();
        }, this);
    };

    /*********************************************************
    * Can create employee after registering addhasValidationErrorsProperty initializer
    *********************************************************/
    test("Can create employee after registering addhasValidationErrorsProperty initializer", 8,
        function () {
            var hasValidationErrorsRaised;
            var store = cloneModuleMetadataStore();

            store.registerEntityTypeCtor("Employee", function () { }, addhasValidationErrorsProperty);

            var employeeType = store.getEntityType("Employee");
            equal(employeeType.autoGeneratedKeyType, breeze.AutoGeneratedKeyType.Identity,
                "'employeeType' should have identity key");

            var emp = employeeType.createEntity();           
            equal(emp.EmployeeID(), 0,
                "new emp should have id===0 before adding to manager");

            ok(emp.hasValidationErrors,
                "new emp should have the 'hasValidationErrors' observable");

            if (emp.hasValidationErrors) {
                emp.hasValidationErrors.subscribe(function () {
                    hasValidationErrorsRaised = true;
                });
            }

            ok(emp.hasValidationErrors && !emp.hasValidationErrors(),
                "'hasValidationErrors' should be false before adding to manager.");
            
            var manager = new breeze.EntityManager({
                serviceName: northwindService,
                metadataStore: store
            });
            manager.addEntity(emp);
            
            ok(emp.EmployeeID() < 0,
                "new emp should have temp id <0 after adding to manager; is " + emp.EmployeeID());

            // A manager's default validationOptions are set to validate the entity
            // when it is attached (added) to the manager
            ok(emp.hasValidationErrors && emp.hasValidationErrors(),
                "'hasValidationErrors' should be true after adding to manager.");
            
            ok(hasValidationErrorsRaised,
                "'hasValidationErrors' observable raised a notification");

            ok(true, "Validation messages are: "+ testFns.getValidationErrMsgs(emp));
        });
    
    // Initializer that adds hasValidationErrors observable property
    // to any entity. This observable notifies when validation errors change
    function addhasValidationErrorsProperty(entity) {

        var prop = ko.observable(false);

        var onChange = function () {
            var hasError = entity.entityAspect.getValidationErrors().length > 0;
            if (prop() === hasError) {
                // collection changed even though entity net error state is unchanged
                prop.valueHasMutated(); // force notification
            } else {
                prop(hasError); // change the value and notify
            }
        };

        onChange();             // check now ...
        entity.entityAspect // ... and when errors collection changes
            .validationErrorsChanged.subscribe(onChange);

        // observable property is wired up; now add it to the entity
        entity.hasValidationErrors = prop;
    }
    /*********************************************************
    * queried entity has new property from post-construction initializer
    *********************************************************/
    test("queried entity has new property from post-construction initializer", 1,
        function () {
            var store = cloneModuleMetadataStore();

            var Customer = function () { };

            var customerInitializer = function (customer) {
                customer.foo = "Foo " + customer.CompanyName();
            };

            store.registerEntityTypeCtor("Customer", Customer, customerInitializer);
        
            // create EntityManager with extended metadataStore
            var em = newEm(store);
            var query = EntityQuery.from("Customers").top(1);

            stop(); // going async
            em.executeQuery(query)
                .then(function (data) {
                    var cust = data.results[0];
                    equal(cust.foo, "Foo "+cust.CompanyName(),
                        "'foo' property, created in initializer, performed as expected");
                })
                .fail(handleFail)
                .fin(start);
    });
    /*********************************************************
    * unmapped property (and only unmapped property) preserved after export/import
    *********************************************************/
    test("unmapped property preserved after export/import", 3,
        function () {
            var store = cloneModuleMetadataStore();

            var Customer = function () {
                this.unmappedProperty = "";
            };

            var customerInitializer = function (customer) {
                customer.initializerProperty =
                    customer.foo || "new initializerProperty";
            };

            store.registerEntityTypeCtor("Customer", Customer, customerInitializer);

            // create EntityManager with extended metadataStore
            var em1 = newEm(store);

            // create a new customer defined by that extended metadata
            var cust1 = em1.createEntity('Customer', {CustomerID: testFns.newGuidComb()});

            // Set the 'properties' we added
            cust1.unmappedProperty("Hi, I'm unmapped");
            cust1.initializerProperty = "Hi, I'm the initializerProperty";
            cust1.adHocProperty = 42; // can always add another property; it's JavaScript

            var exportData = em1.exportEntities();

            var em2 = newEm(store);
            em2.importEntities(exportData);
            var cust2 = em2.getEntities()[0];

            // Only cust2.unmappedProperty should be preserved
            equal(cust2.unmappedProperty(), "Hi, I'm unmapped",
                "cust2.unmappedProperty's value should be restored after import");
            equal(cust2.initializerProperty, "new initializerProperty",
                "cust2.initializerProperty's value should NOT be restored after import; it is '{0}' "
                .format(cust2.initializerProperty));
            ok(typeof cust2.adHocProperty === "undefined",
                "cust2.adHocProperty should be undefined");

        });

    /*********************************************************
    * createEntity sequence is ctor, init-vals, init-er, add
    *********************************************************/
    test("createEntity sequence is ctor, init-vals, init-er, add", 1,
        function () {
            /* Arrange */
            var expected = {
                ctor: "constructor",
                initVals: "initialValues",
                initer: "initializer",
                attach: "added to manager"
            };
            var actual = [];
            var store = cloneModuleMetadataStore();
            store.registerEntityTypeCtor(
                'Customer',
                function () { // ctor
                    actual.push(expected.ctor);
                },
                function (c) { // initializer
                    if (c.CompanyName !== null) {
                        // CompanyName setting must have happened before this initializer
                        actual.push(expected.initVals); 
                    }
                    actual.push(expected.initer);
                });
            actual = []; // reset after registration
            
            var em = newEm(store);
            em.entityChanged.subscribe(function (args) {
                if (args.entityAction === breeze.EntityAction.Attach) {
                    actual.push(expected.attach);
                }
            });
            
            /* ACT */
            var cust = em.createEntity('Customer', {
// ReSharper restore UnusedLocals
                CustomerID: testFns.newGuidComb(),
                CompanyName: expected[1]
            });
            
            /* ASSERT */
            var exp = [];
            for (var prop in expected) { exp.push(expected[prop]);}
            deepEqual(actual, exp,
                "Call sequence should be: "+exp.join(", "));
        });

    /*********************************************************
    * query sequence is ctor, init-er, merge
    *********************************************************/
    test("query entity sequence is ctor, init-er, merge", 1,
        function () {
            /* Arrange */
            var expected = {
                ctor: "constructor",
                initer: "initializer",
                attach: "merge"
            };
            var actual = [];
            var store = cloneModuleMetadataStore();
            store.registerEntityTypeCtor(
                'Customer',
                function () { // ctor
                    actual.push(expected.ctor);
                },
                function () {
                    actual.push(expected.initer);
                });
            actual = []; // reset after registration

            var em = newEm(store);
            em.entityChanged.subscribe(function (args) {
                if (args.entityAction === breeze.EntityAction.AttachOnQuery) {
                    actual.push(expected.attach);
                }
            });

            /* ACT */
            stop();
            EntityQuery
                .from('Customers').take(1)
                .using(em).execute()
                .then(success).fail(handleFail).fin(start);

            /* ASSERT */
            function success() {
                var exp = [];
                for (var prop in expected) { exp.push(expected[prop]); }
                deepEqual(actual, exp,
                    "Call sequence should be: " + exp.join(", "));
            }
        });
    /*********************************************************
    * can define custom temporary key generator
    * must conform to the keygenerator-interface
    * http://www.breezejs.com/sites/all/apidocs/classes/~keyGenerator-interface.html
    *********************************************************/
    test("can define custom temporary key generator", 3,
        function () {
            var em = newEm();

            // add statics for testing the key generator
            var tempIds = testKeyGenerator.tempIds = [];

            em.setProperties({ keyGeneratorCtor: testKeyGenerator });

            // Order has an integer key.
            // temporary keys are assigned when added to an EntityManager
            var o1 = em.createEntity('Order');
            var o2 = em.createEntity('Order');

            // Customer has a client-assigned Guid key
            // A new Customer does not add its key to the tempIds
            em.createEntity('Customer',{CustomerID: testFns.newGuidComb()});

            equal(tempIds.length, 2, "should have 2 tempIds");
            equal(o1.OrderID(), tempIds[0], "o1 should have temp key " + tempIds[0]);
            equal(o2.OrderID(), tempIds[1], "o2 should have temp key " + tempIds[1]);

        });

    function testKeyGenerator() {
        var self = this;
        this.nextNumber = -1000;

        this.generateTempKeyValue = function (entityType) {
            var keyProps = entityType.keyProperties;
            if (keyProps.length > 1) {
                throw new Error("Cannot autogenerate multi-part keys");
            }
            var keyProp = keyProps[0];
            var nextId = GetNextId(keyProp.dataType);
            testKeyGenerator.tempIds.push(nextId);
            return nextId;
        };

        function GetNextId(dataType) {
            if (dataType.isNumeric) {
                return self.nextNumber -= 1;
            }

            if (dataType === breeze.DataType.Guid) {
                return breeze.core.getUuid();
            }

            throw new Error("Cannot generate key for a property of datatype: " +
                dataType.toString());
        }
    }
    
    /*********************************************************
    * If a store-generated key and the key value is the default value
    * the default value is replaced by client-side temporary key generator
    *********************************************************/
    test("store-gen keys w/ default values are re-set by key generator upon add to manager", 2,
        function () {
            var em = newEm();

            var o1 = em.createEntity('Order');
            var o1Id = o1.OrderID();
            ok(o1Id !== 0,
                "o1's default key should be replaced w/ new temp key; it is " + o1Id);

            var orderEntityType = em.metadataStore.getEntityType("Order");
            var o2 = orderEntityType.createEntity();
            o2.OrderID(42); // set to other than default value (0 for ints)
            em.addEntity(o2); // now add to the manager

            equal(o2.OrderID(), 42,
                "o2's key, 42, should not be replaced w/ new temp key when added.");
        });

    module("entityExtensionTests - backingstore", {
        setup: backingStoreSetup,
        teardown: restoreModelAdapter
    });

    function backingStoreSetup() {
        this.priorAdapterName = breeze.config.getAdapterInstance("modelLibrary").name;
        breeze.config.initializeAdapterInstance("modelLibrary", "backingStore", true);
        moduleMetadataStoreSetup();
    }
    function restoreModelAdapter() {
        breeze.config.initializeAdapterInstance("modelLibrary", this.priorAdapterName, true);
    }

    /*********************************************************
    * unmapped property can be set by server class calculated property
    *********************************************************/
    test("unmapped property can be set by a calculated property of the server class", 4, function () {

        var store1 = cloneModuleMetadataStore();

        var store2 = cloneModuleMetadataStore();
        var employeeCtor = function () {
            //'Fullname' is a server-side calculated property of the Employee class
            // This unmapped property will be empty for new entities
            // but will be set for existing entities during query materialization
            this.FullName = "";
        };
        store2.registerEntityTypeCtor("Employee", employeeCtor);


        var em1 = newEm(store1); // no unmapped properties registered
        var prop = em1.metadataStore.getEntityType('Employee').getProperty('FullName');
        ok(!prop,
            "'FullName' should NOT be a registered property of 'em1'.");

        var em2 = newEm(store2);
        prop = em2.metadataStore.getEntityType('Employee').getProperty('FullName');
        ok(prop && prop.isUnmapped,
            "'FullName' should be an unmapped property in 'em2'");

        var query = EntityQuery.from('Employees');
        var p1 = em1.executeQuery(query).then(success1);
        var p2 = em2.executeQuery(query).then(success2);

        stop(); // going async

        Q.all([p1, p2]).fail(handleFail).fin(start);

        function success1(data) {
            var first = data.results[0];
            var fullname = first.FullName;
            ok(fullname === undefined, "an Employee queried with 'em1' should NOT have a 'FullName' property, let alone a value for it");
        }

        function success2(data) {
            var first = data.results[0];
            var fullname = first.FullName;
            ok(fullname, "an Employee queried with 'em2' should have a calculated FullName ('Last, First'); it is '{0}'"
                .format(fullname));
        }

    });

    /*********************************************************
    * helpers
    *********************************************************/

    function assertFooPropertyDefined(metadataStore, shouldBe) {
        var custType = metadataStore.getEntityType("Customer");
        var fooProp = custType.getDataProperty('foo');
        if (shouldBe) {
            ok(fooProp && fooProp.isUnmapped,
                "'foo' property should be defined as unmapped property after registration.");
        } else {
            ok(!fooProp, "'foo' property should NOT be defined before registration.");
        }
        return fooProp;
    }
    function cloneModuleMetadataStore() {
        return cloneStore(moduleMetadataStore);
    }
    function cloneStore(source) {
        var metaExport = source.exportMetadata();
        return new MetadataStore().importMetadata(metaExport);
    }
    function newEm(metadataStore) {
        return new EntityManager({
            serviceName: northwindService,
            metadataStore: metadataStore || moduleMetadataStore
        });
    }
})(docCode.testFns);