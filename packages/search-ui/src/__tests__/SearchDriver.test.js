import SearchDriver, { DEFAULT_STATE } from "../SearchDriver";

import {
  doesStateHaveResponseData,
  setupDriver,
  getMockApiConnector
} from "../test/helpers";

// We mock this so no state is actually written to the URL
jest.mock("../URLManager.js");
import URLManager from "../URLManager";

beforeEach(() => {
  URLManager.mockClear();
});

const mockApiConnector = getMockApiConnector();

const params = {
  apiConnector: mockApiConnector,
  trackUrlState: false
};

function getSearchCalls(specificMockApiConnector) {
  return (specificMockApiConnector || mockApiConnector).onSearch.mock.calls;
}

function getAutocompleteCalls(specificMockApiConnector) {
  return (specificMockApiConnector || mockApiConnector).onAutocomplete.mock
    .calls;
}

beforeEach(() => {
  mockApiConnector.onAutocomplete.mockClear();
  mockApiConnector.onSearch.mockClear();
  mockApiConnector.onResultClick.mockClear();
  mockApiConnector.onAutocompleteResultClick.mockClear();
});

it("can be initialized", () => {
  const driver = new SearchDriver(params);
  expect(driver).toBeInstanceOf(SearchDriver);
});

it("will use initial state if provided", () => {
  const initialState = {
    current: 3,
    resultsPerPage: 60,
    sortField: "name",
    sortDirection: "asc"
  };

  const { stateAfterCreation } = setupDriver({ initialState });

  expect(stateAfterCreation).toEqual({
    ...DEFAULT_STATE,
    ...initialState
  });
});

it("will merge default and custom a11yNotificationMessages", () => {
  const { driver } = setupDriver({
    a11yNotificationMessages: {
      customMessage: () => "Hello world",
      moreFilter: () => "Example override"
    }
  });
  const messages = driver.a11yNotificationMessages;

  expect(messages.customMessage()).toEqual("Hello world");
  expect(messages.moreFilter()).toEqual("Example override");
  expect(messages.searchResults({ start: 0, end: 0, totalResults: 0 })).toEqual(
    "Showing 0 to 0 results out of 0"
  );
});

it("will default facets to {} in state if facets is missing from the response", () => {
  const initialState = {
    searchTerm: "test"
  };

  const { stateAfterCreation } = setupDriver({
    initialState,
    mockSearchResponse: {
      totalResults: 1000,
      totalPages: 100,
      requestId: "67890",
      results: [{}, {}]
    }
  });

  expect(doesStateHaveResponseData(stateAfterCreation)).toBe(true);
  expect(stateAfterCreation.requestId).toEqual("67890");
  expect(stateAfterCreation.facets).toEqual({});
});

it("will trigger a search if searchTerm or filters are provided in initial state", () => {
  const initialState = {
    filters: [{ field: "initial", values: ["value"], type: "all" }],
    searchTerm: "test"
  };

  const { stateAfterCreation } = setupDriver({
    initialState
  });

  expect(doesStateHaveResponseData(stateAfterCreation)).toBe(true);
});

it("does not do an initial search when alwaysSearchOnInitialLoad is not set", () => {
  const initialState = {};

  const { stateAfterCreation } = setupDriver({ initialState });

  expect(doesStateHaveResponseData(stateAfterCreation)).toBe(0);
});

it("does do an initial search when alwaysSearchOnInitialLoad is set", () => {
  const initialState = {};

  const { stateAfterCreation } = setupDriver({
    initialState,
    alwaysSearchOnInitialLoad: true
  });

  expect(doesStateHaveResponseData(stateAfterCreation)).toBe(true);
});

it("will sync initial state to the URL", () => {
  const initialState = {
    filters: [{ field: "initial", values: ["value"], type: "all" }],
    searchTerm: "test"
  };

  setupDriver({ initialState });

  expect(URLManager.mock.instances[0].pushStateToURL.mock.calls).toHaveLength(
    1
  );
});

it("will not sync initial state to the URL if trackURLState is set to false", () => {
  const initialState = {
    filters: [{ field: "initial", values: ["value"], type: "all" }],
    searchTerm: "test"
  };

  setupDriver({ initialState, trackUrlState: false });

  expect(URLManager.mock.instances).toHaveLength(0);
});

describe("searchQuery config", () => {
  describe("conditional facets", () => {
    function subject(conditional) {
      const driver = new SearchDriver({
        ...params,
        initialState: {
          filters: [{ field: "initial", values: ["value"], type: "all" }],
          searchTerm: "test"
        },
        searchQuery: {
          facets: {
            initial: {
              type: "value"
            }
          },
          conditionalFacets: {
            initial: conditional
          }
        }
      });

      driver.setSearchTerm("test");
    }

    it("will fetch a conditional facet that passes its check", () => {
      subject(filters => !!filters);

      // 'initial' WAS included in request to server
      expect(getSearchCalls()[1][1].facets).toEqual({
        initial: {
          type: "value"
        }
      });
    });

    it("will not fetch a conditional facet that fails its check", () => {
      subject(filters => !filters);

      // 'initial' was NOT included in request to server
      expect(getSearchCalls()[1][1].facets).toEqual({});
    });
  });

  describe("pass through values", () => {
    function subject({
      disjunctiveFacets,
      disjunctiveFacetsAnalyticsTags,
      result_fields,
      search_fields
    }) {
      const driver = new SearchDriver({
        ...params,
        searchQuery: {
          facets: {
            initial: {
              type: "value"
            }
          },
          disjunctiveFacets,
          disjunctiveFacetsAnalyticsTags,
          result_fields,
          search_fields
        }
      });

      driver.setSearchTerm("test");
    }

    it("will pass through facet configuration", () => {
      const facets = {
        initial: {
          type: "value"
        }
      };
      subject({ facets });
      expect(getSearchCalls()[0][1].facets).toEqual({
        initial: {
          type: "value"
        }
      });
    });

    it("will pass through disjunctive facet configuration", () => {
      const disjunctiveFacets = ["initial"];
      subject({ disjunctiveFacets });
      expect(getSearchCalls()[0][1].disjunctiveFacets).toEqual(["initial"]);
    });

    it("will pass through disjunctive facet analytics tags", () => {
      const disjunctiveFacetsAnalyticsTags = ["Test"];
      subject({ disjunctiveFacetsAnalyticsTags });
      expect(getSearchCalls()[0][1].disjunctiveFacetsAnalyticsTags).toEqual([
        "Test"
      ]);
    });

    it("will pass through result_fields configuration", () => {
      const result_fields = { test: {} };
      subject({ result_fields });
      expect(getSearchCalls()[0][1].result_fields).toEqual(result_fields);
    });

    it("will pass through search_fields configuration", () => {
      const search_fields = { test: {} };
      subject({ search_fields });
      expect(getSearchCalls()[0][1].search_fields).toEqual(search_fields);
    });
  });
});

describe("autocompleteQuery config", () => {
  function subject(config) {
    const driver = new SearchDriver({
      ...params,
      autocompleteQuery: {
        results: config
      }
    });

    driver.setSearchTerm("test", { refresh: false, autocompleteResults: true });
  }

  it("will pass through result_fields configuration", () => {
    const result_fields = { test: {} };
    subject({ result_fields });
    expect(getAutocompleteCalls()[0][1].results.result_fields).toEqual(
      result_fields
    );
  });

  it("will pass through search_fields configuration", () => {
    const search_fields = { test: {} };
    subject({ search_fields });
    expect(getAutocompleteCalls()[0][1].results.search_fields).toEqual(
      search_fields
    );
  });
});

describe("#getState", () => {
  it("returns the current state", () => {
    const driver = new SearchDriver(params);
    expect(driver.getState()).toEqual(DEFAULT_STATE);
  });
});

describe("subscribeToStateChanges", () => {
  it("will add a subscription", () => {
    const { driver } = setupDriver();
    let called = false;
    driver.subscribeToStateChanges(() => (called = true));
    driver.setSearchTerm("test");
    expect(called).toBe(true);
  });

  it("will add multiple subscriptions", () => {
    const { driver } = setupDriver();
    let called1 = false;
    let called2 = false;
    driver.subscribeToStateChanges(() => (called1 = true));
    driver.subscribeToStateChanges(() => (called2 = true));
    driver.setSearchTerm("test");
    expect(called1).toBe(true);
    expect(called2).toBe(true);
  });

  it("will update own state before notifying subscribers", () => {
    const { driver } = setupDriver();
    let searchTermFromDriver, searchTermFromSubscription, called;
    driver.subscribeToStateChanges(state => {
      // So that this subscription does not run multiple times
      if (called) return;
      called = true;
      searchTermFromDriver = driver.getState().searchTerm;
      searchTermFromSubscription = state.searchTerm;
    });
    driver.setSearchTerm("newValue");
    expect(searchTermFromDriver).toBe("newValue");
    expect(searchTermFromSubscription).toBe("newValue");
  });
});

describe("unsubscribeToStateChanges", () => {
  it("will remove subscription", () => {
    const { driver } = setupDriver();
    let called1 = false;
    let called2 = false;
    let sub1 = () => (called1 = true);
    let sub2 = () => (called2 = true);
    driver.subscribeToStateChanges(sub1);
    driver.subscribeToStateChanges(sub2);
    driver.setSearchTerm("test");
    expect(called1).toBe(true);
    expect(called2).toBe(true);
    called1 = false;
    called2 = false;
    driver.unsubscribeToStateChanges(sub1);
    driver.setSearchTerm("test");
    expect(called1).toBe(false); // Did not call, unsubscribed
    expect(called2).toBe(true);
  });
});

describe("tearDown", () => {
  it("will remove subscriptions and stop listening for URL changes", () => {
    const { driver } = setupDriver();
    let called1 = false;
    let called2 = false;
    let sub1 = () => (called1 = true);
    let sub2 = () => (called2 = true);
    driver.subscribeToStateChanges(sub1);
    driver.subscribeToStateChanges(sub2);
    driver.setSearchTerm("test");
    expect(called1).toBe(true);
    expect(called2).toBe(true);
    expect(URLManager.mock.instances[0].tearDown.mock.calls.length).toBe(0);
    called1 = false;
    called2 = false;
    driver.tearDown();
    driver.setSearchTerm("test");
    expect(called1).toBe(false); // Did not call, unsubscribed
    expect(called2).toBe(false); // Did not call, unsubscribed
    expect(URLManager.mock.instances[0].tearDown.mock.calls.length).toBe(1);
  });
});

describe("#getActions", () => {
  it("returns the current state", () => {
    const driver = new SearchDriver(params);
    const actions = driver.getActions();
    expect(Object.keys(actions).length).toBe(12);
    expect(actions.addFilter).toBeInstanceOf(Function);
    expect(actions.clearFilters).toBeInstanceOf(Function);
    expect(actions.removeFilter).toBeInstanceOf(Function);
    expect(actions.reset).toBeInstanceOf(Function);
    expect(actions.setFilter).toBeInstanceOf(Function);
    expect(actions.setResultsPerPage).toBeInstanceOf(Function);
    expect(actions.setSearchTerm).toBeInstanceOf(Function);
    expect(actions.setSort).toBeInstanceOf(Function);
    expect(actions.setCurrent).toBeInstanceOf(Function);
    expect(actions.trackClickThrough).toBeInstanceOf(Function);
    expect(actions.trackAutocompleteClickThrough).toBeInstanceOf(Function);
    expect(actions.a11yNotify).toBeInstanceOf(Function);
  });
});

describe("_updateSearchResults", () => {
  const initialState = {
    searchTerm: "test",
    resultsPerPage: 20,
    current: 2
  };

  it("calculates pagingStart and pagingEnd correctly", () => {
    const { stateAfterCreation } = setupDriver({ initialState });

    expect(stateAfterCreation.totalResults).toEqual(1000);
    expect(stateAfterCreation.pagingStart).toEqual(21);
    expect(stateAfterCreation.pagingEnd).toEqual(40);
  });

  it("does not set pagingEnd to more than the total # of results", () => {
    const mockSearchResponse = { totalResults: 30, totalPages: 2 };

    const { stateAfterCreation } = setupDriver({
      initialState,
      mockSearchResponse
    });

    expect(stateAfterCreation.totalResults).toEqual(30);
    expect(stateAfterCreation.pagingStart).toEqual(21);
    expect(stateAfterCreation.pagingEnd).toEqual(30);
  });

  it("zeroes out pagingStart and pagingEnd correctly", () => {
    const mockSearchResponse = { totalResults: 0 };

    const { stateAfterCreation } = setupDriver({
      initialState,
      mockSearchResponse
    });

    expect(stateAfterCreation.totalResults).toEqual(0);
    expect(stateAfterCreation.pagingStart).toEqual(0);
    expect(stateAfterCreation.pagingEnd).toEqual(0);
  });

  it("calls a11yNotify when search results update", () => {
    const searchResultsNotification = jest.fn();

    setupDriver({
      initialState,
      hasA11yNotifications: true,
      a11yNotificationMessages: {
        searchResults: searchResultsNotification
      }
    });

    expect(searchResultsNotification).toHaveBeenCalledWith({
      start: 21,
      end: 40,
      totalResults: 1000,
      searchTerm: "test"
    });
  });
});
